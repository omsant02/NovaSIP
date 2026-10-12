import {
  DEFAULT_COINS,
  getFundingSnapshot,
  getRangeSignal,
} from "../hyperliquid/market.js";
import {
  closeCarry,
  getHlpEquity,
  getLendingState,
  hlpDeposit,
  lendSupply,
  lendWithdraw,
  openCarry,
} from "../hyperliquid/hl.js";
import {
  CAPS,
  MAX_CHANGE_PER_CYCLE_PCT,
  STRATEGIES,
  checkProposal,
  type Allocation,
} from "./guardrails.js";
import { getWalletAssets } from "../chain/walletAssets.js";
import {
  appendDecision,
  currentUser,
  getBook,
  getProfile,
  readDecisions,
  saveBook,
  type ActionRecord,
} from "./state.js";

// Demo-sized real actions on Hyperliquid testnet. The book (percentages) is what the dashboard shows;
// real orders are intentionally small.
const CARRY_DEMO_SIZE_ETH = "0.1";
const DEMO_LEND_MAX_USD = 5;
const DEMO_HLP_MAX_USD = 5;
const MIN_LEND_USD = 1;

// Used only if the live rate request fails. Last values seen on the testnet UI.
const FALLBACK_LENDING_APY_PCT = 1.9;
const FALLBACK_HLP_APR_PCT = 4;

const HL_API =
  process.env.HL_TESTNET === "false"
    ? "https://api.hyperliquid.xyz"
    : "https://api.hyperliquid-testnet.xyz";
const HLP_VAULT_ADDRESS = "0xa15099a30bbf2e68942d6f4c43d70d04faeab0a0";

async function hlInfo(body: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${HL_API}/info`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Live lending supply APY and HLP APR from Hyperliquid's public info API.
async function getLiveRates() {
  const [lend, hlp] = await Promise.allSettled([
    hlInfo({ type: "borrowLendReserveState", token: 0 }),
    hlInfo({ type: "vaultDetails", vaultAddress: HLP_VAULT_ADDRESS }),
  ]);

  const supply =
    lend.status === "fulfilled" ? Number(lend.value?.supplyYearlyRate) : NaN;
  const util =
    lend.status === "fulfilled" ? Number(lend.value?.utilization) : NaN;
  const apr = hlp.status === "fulfilled" ? Number(hlp.value?.apr) : NaN;

  return {
    lending: Number.isFinite(supply)
      ? {
          supplyApyPct: Number((supply * 100).toFixed(2)),
          utilizationPct: Number.isFinite(util)
            ? Number((util * 100).toFixed(1))
            : null,
          source: "live",
          note: "USDC supply rate read live from Hyperliquid; variable",
        }
      : {
          supplyApyPct: FALLBACK_LENDING_APY_PCT,
          utilizationPct: null,
          source: "fallback",
          note: "live read failed; last value seen on the testnet Earn page",
        },
    hlp: Number.isFinite(apr)
      ? {
          aprPct: Number((apr * 100).toFixed(2)),
          source: "live",
          note: "read live from Hyperliquid vault details; illiquid, 4-day lockup",
        }
      : {
          aprPct: FALLBACK_HLP_APR_PCT,
          source: "fallback",
          note: "live read failed; last value seen on the vault page; illiquid, 4-day lockup",
        },
  };
}

export const toolDeclarations = [
  {
    type: "function",
    name: "get_wallet_assets",
    description:
      "What the current user holds: funds already deposited in the vaults, USDC on HyperEVM, stock tokens on Robinhood Chain (wallet and vault), and HyperCore spot balances. Read-only; use it to suggest deposits.",
    parameters: {
      type: "object",
      properties: {
        detail: { type: "boolean", description: "Optional. Unused." },
      },
    },
  },
  {
    type: "function",
    name: "get_market_snapshot",
    description:
      "Current perp funding rates (annualized %), prices, and 1-year range signals for the given coins, plus the live lending supply APY and HLP APR.",
    parameters: {
      type: "object",
      properties: {
        coins: {
          type: "array",
          items: { type: "string" },
          description:
            "Coins to look at, e.g. ['ETH','BTC','SOL']. Defaults to ETH, BTC, SOL.",
        },
      },
    },
  },
  {
    type: "function",
    name: "get_portfolio",
    description:
      "The user's risk tier, deployable funds (their real deposits in the vaults), current allocation (percent per strategy), the caps for their tier, and live lending and HLP state.",
    parameters: {
      type: "object",
      properties: {
        detail: {
          type: "boolean",
          description: "Set true to include raw lending and HLP state.",
        },
      },
    },
  },
  {
    type: "function",
    name: "propose_allocation",
    description:
      "Propose a new target allocation (percent of deployable funds per strategy, remainder stays idle cash). The guardrails check it; if approved, the actions are executed. If rejected, the reasons are returned so you can propose a corrected allocation.",
    parameters: {
      type: "object",
      properties: {
        carry: {
          type: "number",
          description: "Delta-neutral ETH carry, percent.",
        },
        lending: {
          type: "number",
          description: "HyperCore USDC lending, percent.",
        },
        hlp: {
          type: "number",
          description:
            "HLP vault, percent. Illiquid (4-day lock), can only grow.",
        },
        directional: {
          type: "number",
          description: "Directional alpha, percent.",
        },
        robinhood: {
          type: "number",
          description:
            "Robinhood Chain stock-token lending (simulated), percent.",
        },
        reasoning: {
          type: "string",
          description: "Short plain-language explanation shown to the user.",
        },
      },
      required: [
        "carry",
        "lending",
        "hlp",
        "directional",
        "robinhood",
        "reasoning",
      ],
    },
  },
];

// Deployable funds = what the user really deposited (hub + Robinhood principal).
// Falls back to the stored book value if the on-chain read reports an error.
async function getDeployableUsd(
  fallbackUsd: number,
): Promise<{ usd: number; source: "hub" | "book" }> {
  try {
    const w = await getWalletAssets(currentUser());
    if (((w as any).errors?.length ?? 0) > 0) {
      return { usd: fallbackUsd, source: "book" };
    }
    const d = (w as any).deposited;
    const usd = Number(d.hubPrincipalUsd) + Number(d.robinhoodPrincipalUsd);
    if (!Number.isFinite(usd)) return { usd: fallbackUsd, source: "book" };
    return { usd, source: "hub" };
  } catch {
    return { usd: fallbackUsd, source: "book" };
  }
}

async function getMarketSnapshot(args: Record<string, unknown>) {
  const coins =
    Array.isArray(args.coins) && args.coins.length
      ? (args.coins as string[])
      : DEFAULT_COINS;
  const [funding, rates] = await Promise.all([
    getFundingSnapshot(coins),
    getLiveRates(),
  ]);
  const ranges = await Promise.all(
    coins.map((c) =>
      getRangeSignal(c).catch((e) => ({
        coin: c,
        error: e instanceof Error ? e.message : String(e),
      })),
    ),
  );
  return {
    funding,
    ranges,
    lending: rates.lending,
    hlp: rates.hlp,
  };
}

async function getPortfolio(args: Record<string, unknown>) {
  const book = await getBook();
  const profile = await getProfile();
  const deployable = await getDeployableUsd(book.totalUsd);
  const recent = (await readDecisions(3)).map((d) => ({
    time: d.time,
    approved: d.approved,
    allocationPct: d.to,
    reasoning: d.reasoning,
  }));
  const daysLeft = profile.goalDate
    ? Math.max(
        0,
        Math.round((Date.parse(profile.goalDate) - Date.now()) / 86_400_000),
      )
    : null;
  const initial = STRATEGIES.every((s) => book.allocation[s] === 0);

  const base = {
    tier: book.tier,
    totalUsd: deployable.usd,
    totalUsdSource: deployable.source,
    goal: {
      name: profile.goalName,
      targetUsd: profile.targetUsd,
      goalDate: profile.goalDate,
      daysLeft,
    },
    memoryNotes: profile.notes,
    recentDecisions: recent,
    allocationPct: book.allocation,
    isInitialDeployment: initial,
    caps: CAPS[book.tier],
    maxChangePerCyclePct: MAX_CHANGE_PER_CYCLE_PCT,
  };
  if (!args.detail) return base;
  const [lending, hlp] = await Promise.all([getLendingState(), getHlpEquity()]);
  return { ...base, lending, hlp };
}

async function run(
  actions: ActionRecord[],
  name: string,
  args: unknown,
  simulated: boolean,
  fn: () => Promise<unknown>,
) {
  try {
    const result = simulated ? "simulated" : await fn();
    actions.push({ name, args, result, simulated });
  } catch (e) {
    actions.push({
      name,
      args,
      result: null,
      simulated,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

async function execute(
  current: Allocation,
  target: Allocation,
  totalUsd: number,
) {
  const actions: ActionRecord[] = [];
  const deltaUsd = (s: keyof Allocation) =>
    ((target[s] - current[s]) / 100) * totalUsd;

  // Lending (real, demo-sized)
  const dl = deltaUsd("lending");
  if (dl > 0) {
    const amt = Math.min(dl, DEMO_LEND_MAX_USD);
    if (amt >= MIN_LEND_USD) {
      await run(actions, "lend_supply", { usd: amt.toFixed(2) }, false, () =>
        lendSupply(amt.toFixed(2)),
      );
    }
  } else if (dl < 0) {
    const amt = Math.min(-dl, DEMO_LEND_MAX_USD);
    if (amt >= MIN_LEND_USD) {
      await run(actions, "lend_withdraw", { usd: amt.toFixed(2) }, false, () =>
        lendWithdraw(amt.toFixed(2)),
      );
    }
  }

  // Carry (real, fixed demo size, only on open/close transitions)
  if (current.carry <= 0 && target.carry > 0) {
    await run(
      actions,
      "open_carry",
      { sizeEth: CARRY_DEMO_SIZE_ETH },
      false,
      () => openCarry(CARRY_DEMO_SIZE_ETH),
    );
  } else if (current.carry > 0 && target.carry <= 0) {
    await run(
      actions,
      "close_carry",
      { sizeEth: CARRY_DEMO_SIZE_ETH },
      false,
      () => closeCarry(CARRY_DEMO_SIZE_ETH),
    );
  }

  // HLP (real, demo-sized, only grows)
  const dh = deltaUsd("hlp");
  if (dh > 0) {
    const amt = Math.min(dh, DEMO_HLP_MAX_USD);
    await run(actions, "hlp_deposit", { usd: amt }, false, () =>
      hlpDeposit(amt),
    );
  }

  // Directional: no order logic built yet, recorded as a paper position
  if (target.directional !== current.directional) {
    await run(
      actions,
      "directional_paper",
      { from: current.directional, to: target.directional },
      true,
      async () => null,
    );
  }

  // Robinhood Chain: simulated leg (MockMorpho)
  if (target.robinhood !== current.robinhood) {
    await run(
      actions,
      "rh_allocate",
      { from: current.robinhood, to: target.robinhood },
      true,
      async () => null,
    );
  }

  return actions;
}

async function proposeAllocation(args: Record<string, unknown>) {
  const book = await getBook();
  const current = book.allocation;
  const target = {} as Allocation;
  for (const s of STRATEGIES) target[s] = Number(args[s]);
  const reasoning = String(args.reasoning ?? "");
  const initial = STRATEGIES.every((s) => current[s] === 0);

  const verdict = checkProposal(book.tier, current, target, { initial });
  if (!verdict.approved) {
    await appendDecision({
      time: new Date().toISOString(),
      tier: book.tier,
      from: current,
      to: target,
      approved: false,
      reasons: verdict.reasons,
      reasoning,
      actions: [],
    });
    return { approved: false, reasons: verdict.reasons };
  }

  const deployable = await getDeployableUsd(book.totalUsd);
  const actions = await execute(current, target, deployable.usd);
  await saveBook({ ...book, allocation: target, totalUsd: deployable.usd });
  await appendDecision({
    time: new Date().toISOString(),
    tier: book.tier,
    from: current,
    to: target,
    approved: true,
    reasons: [],
    reasoning,
    actions,
  });
  return { approved: true, newAllocationPct: target, actions };
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "get_market_snapshot":
      return getMarketSnapshot(args);
    case "get_portfolio":
      return getPortfolio(args);
    case "get_wallet_assets":
      return getWalletAssets(currentUser());
    case "propose_allocation":
      return proposeAllocation(args);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}