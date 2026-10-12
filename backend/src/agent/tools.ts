import type { Address } from "viem";
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
  fromUnits,
  getAllTokenMeta,
  getFundSplit,
  getHoldings,
  syncDepositsToHub,
} from "../chain/robinhood.js";
import {
  accrueMorphoYield,
  creditSurplusYield,
  rotateBySymbol,
  rotateToTarget,
} from "../chain/rotation.js";
import { getStockQuotes } from "../chain/prices.js";
import { getStockYield } from "./morpho.js";
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

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

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
      "What the current user holds: funds already deposited in the vaults, USDC on HyperEVM, stock tokens on Robinhood Chain (wallet and vault, with USD values), and HyperCore spot balances. Read-only; use it to suggest deposits.",
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
      "Current perp funding rates (annualized %), prices, and 1-year range signals for the given coins, the live lending supply APY and HLP APR, plus live stock quotes (price, day move, position in the 52-week range) for the Robinhood Chain stock tokens.",
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
      "The user's risk tier, deployable funds, how those funds split between Hyperliquid and Robinhood Chain, their stock-token holdings (with how much of each is already in USDG), current allocation (percent per strategy), the caps for their tier, and live lending and HLP state.",
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
      "Propose a new target allocation (percent of deployable funds per strategy, remainder stays idle cash). The guardrails check it; if approved, the actions are executed. If rejected, the reasons are returned so you can propose a corrected allocation. Hyperliquid strategies can only use funds deposited on Hyperliquid. For stock tokens on Robinhood Chain, set the 'rotate' map instead of stocks/robinhood: it decides, per stock, how much sits in USDG on Morpho; the stocks and robinhood percentages are then computed for you.",
    parameters: {
      type: "object",
      properties: {
        carry: {
          type: "number",
          description: "Delta-neutral carry on Hyperliquid, percent.",
        },
        lending: {
          type: "number",
          description: "Hyperliquid USDC lending (portfolio-margin), percent.",
        },
        hlp: {
          type: "number",
          description:
            "HLP vault, percent. Illiquid (4-day lock), can only grow.",
        },
        directional: {
          type: "number",
          description: "Directional alpha on Hyperliquid, percent.",
        },
        rotate: {
          type: "object",
          description:
            "Per stock held on Robinhood Chain: the percent (0 to 100) of that holding that should sit in USDG earning the Morpho rate. 0 keeps it as stock, 100 sells all of it into USDG. Include every stock the user holds, e.g. {\"PLTR\":100,\"AMZN\":50,\"NFLX\":0}.",
          properties: {
            TSLA: { type: "number" },
            AMZN: { type: "number" },
            AMD: { type: "number" },
            NFLX: { type: "number" },
            PLTR: { type: "number" },
          },
        },
        stocks: {
          type: "number",
          description:
            "Only if you do not set rotate: stock tokens held on Robinhood Chain, percent.",
        },
        robinhood: {
          type: "number",
          description:
            "Only if you do not set rotate: stock tokens sold into USDG and lent on Morpho, percent.",
        },
        reasoning: {
          type: "string",
          description: "Short plain-language explanation shown to the user.",
        },
      },
      required: ["carry", "lending", "hlp", "directional", "reasoning"],
    },
  },
];

// Deployable funds = Hyperliquid deposits (hub) + stock tokens in the Robinhood vault at live prices.
// Falls back to the stored book value if the on-chain read fails.
async function getFunds(fallbackUsd: number) {
  try {
    const split = await getFundSplit(currentUser() as Address);
    if (Number.isFinite(split.totalUsd)) {
      return { usd: split.totalUsd, source: "hub" as const, split };
    }
  } catch {
    // fall through to the book value
  }
  return { usd: fallbackUsd, source: "book" as const, split: null };
}

async function getStockMarket() {
  try {
    const metas = await getAllTokenMeta();
    const quotes = await getStockQuotes(metas.map((m) => m.symbol));
    return Object.values(quotes).filter(Boolean);
  } catch {
    return [];
  }
}

async function getMarketSnapshot(args: Record<string, unknown>) {
  const coins =
    Array.isArray(args.coins) && args.coins.length
      ? (args.coins as string[])
      : DEFAULT_COINS;
  const [funding, rates, stocks] = await Promise.all([
    getFundingSnapshot(coins),
    getLiveRates(),
    getStockMarket(),
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
    stocks,
  };
}

async function getPortfolio(args: Record<string, unknown>) {
  const user = currentUser() as Address;
  const book = await getBook();
  const profile = await getProfile();

  // Keep the hub books in step with the Robinhood vault before reading them.
  try {
    await syncDepositsToHub(user, book.tier);
  } catch {
    // reading still works without the sync
  }

  const funds = await getFunds(book.totalUsd);
  const rh = await getHoldings(user).catch(() => null);
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
    totalUsd: funds.usd,
    totalUsdSource: funds.source,
    fundsByChain: funds.split
      ? {
          hyperliquidUsd: round2(funds.split.hubUsd),
          robinhoodUsd: round2(funds.split.rhUsd),
          hyperliquidSharePct: round1(funds.split.hubSharePct),
          robinhoodSharePct: round1(funds.split.rhSharePct),
        }
      : null,
    stockHoldings: rh
      ? rh.holdings
          .filter((h) => h.units > 0n)
          .map((h) => ({
            symbol: h.symbol,
            units: fromUnits(h.units, h.decimals),
            priceUsd: h.priceUsd,
            valueUsd: round2(h.valueUsd),
            heldUsd: round2(h.heldUsd),
            rotatedIntoUsdgUsd: round2(h.rotatedUsd),
            rotatedPct:
              h.units > 0n
                ? round1((Number(h.rotatedUnits) / Number(h.units)) * 100)
                : 0,
          }))
      : [],
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

// rotate map from the model: SYMBOL -> percent of that holding in USDG (0 to 100).
function parseRotate(raw: unknown): Record<string, number> | null {
  if (!raw || typeof raw !== "object") return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(v);
    if (Number.isFinite(n)) out[k.toUpperCase()] = Math.min(100, Math.max(0, n));
  }
  return Object.keys(out).length > 0 ? out : null;
}

// The stocks / robinhood percentages that follow from a rotate map.
async function deriveRhTargets(
  user: Address,
  rotate: Record<string, number>,
  totalUsd: number,
) {
  const { holdings, totalUsd: rhUsd } = await getHoldings(user);
  let rotatedUsd = 0;
  for (const h of holdings) {
    const pct =
      rotate[h.symbol.toUpperCase()] ??
      (h.units > 0n ? (Number(h.rotatedUnits) / Number(h.units)) * 100 : 0);
    rotatedUsd += (h.valueUsd * pct) / 100;
  }
  return {
    robinhood: round1((rotatedUsd / totalUsd) * 100),
    stocks: round1(((rhUsd - rotatedUsd) / totalUsd) * 100),
  };
}

async function execute(
  current: Allocation,
  target: Allocation,
  totalUsd: number,
  rhUsd: number,
  rotate: Record<string, number> | null,
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

  // Directional on Hyperliquid: no order logic built yet, recorded as a paper position
  if (target.directional !== current.directional) {
    await run(
      actions,
      "directional_paper",
      { from: current.directional, to: target.directional },
      true,
      async () => null,
    );
  }

  // Robinhood Chain: accrue the Morpho yield, rotate stock <-> USDG per stock, credit any gain.
  if (rhUsd > 0 || current.robinhood > 0) {
    const user = currentUser() as Address;
    const stockYield = await getStockYield();
    const accrual = await accrueMorphoYield(stockYield.supplyApyPct);
    if (accrual) actions.push(accrual);

    if (rotate) {
      actions.push(...(await rotateBySymbol(user, rotate)));
    } else {
      actions.push(...(await rotateToTarget(user, (target.robinhood / 100) * totalUsd)));
    }
    actions.push(...(await creditSurplusYield(user)));
  }

  return actions;
}

async function proposeAllocation(args: Record<string, unknown>) {
  const book = await getBook();
  const user = currentUser() as Address;
  const current = book.allocation;
  const target = {} as Allocation;
  for (const s of STRATEGIES) {
    target[s] = args[s] === undefined ? current[s] : Number(args[s]);
  }
  const reasoning = String(args.reasoning ?? "");
  const initial = STRATEGIES.every((s) => current[s] === 0);

  const funds = await getFunds(book.totalUsd);
  const rotate = funds.split && funds.split.rhUsd > 0 ? parseRotate(args.rotate) : null;

  // With a rotate map, the stocks and robinhood percentages are derived from it.
  if (rotate && funds.usd > 0) {
    try {
      const d = await deriveRhTargets(user, rotate, funds.usd);
      target.robinhood = d.robinhood;
      target.stocks = d.stocks;
    } catch {
      // keep the numbers the model gave
    }
  }

  const verdict = checkProposal(book.tier, current, target, {
    initial,
    ...(funds.split
      ? {
          rhSharePct: funds.split.rhSharePct,
          hubSharePct: funds.split.hubSharePct,
        }
      : {}),
  });
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

  const rhUsd = funds.split?.rhUsd ?? 0;
  const actions = await execute(current, target, funds.usd, rhUsd, rotate);

  // Store what really happened on Robinhood Chain, not just what was asked for.
  if (funds.split && funds.usd > 0 && (rhUsd > 0 || current.robinhood > 0)) {
    try {
      const h = await getHoldings(user);
      target.stocks = round1((h.heldUsd / funds.usd) * 100);
      target.robinhood = round1((h.rotatedUsd / funds.usd) * 100);
    } catch {
      // keep the requested numbers
    }
  }

  await saveBook({ ...book, allocation: target, totalUsd: funds.usd });
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