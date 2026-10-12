import { OPERATOR, getCoreState, getLendingState, getHlpEquity } from "./hl.js";

const HL_API =
  process.env.HL_TESTNET === "true"
    ? "https://api.hyperliquid-testnet.xyz"
    : "https://api.hyperliquid.xyz";
const HLP_VAULT = "0xa15099a30bbf2e68942d6f4c43d70d04faeab0a0";

// Sign of cumFunding. Compare with the Funding column of the ETH position in
// the Hyperliquid UI and flip this to 1 if the UI shows the opposite sign.
const FUNDING_EARNED_SIGN = -1;

export type StrategyPerf = {
  capitalUsd: number | null;
  pnlUsd: number | null;
  returnPct: number | null;
  source: string;
};

export type Performance = {
  carry: StrategyPerf;
  lending: StrategyPerf;
  hlp: StrategyPerf;
  raw: { ethCumFunding: string | null };
  updatedAt: string;
};

function perf(
  capital: number | null,
  pnl: number | null,
  source: string,
): StrategyPerf {
  const returnPct =
    capital !== null && capital > 0 && pnl !== null ? (pnl / capital) * 100 : null;
  return { capitalUsd: capital, pnlUsd: pnl, returnPct, source };
}

// What was put into HLP, from the account ledger (deposits minus withdrawals).
async function hlpBasis(): Promise<number | null> {
  try {
    const res = await fetch(`${HL_API}/info`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "userNonFundingLedgerUpdates",
        user: OPERATOR,
        startTime: 0,
      }),
    });
    if (!res.ok) return null;
    const updates = (await res.json()) as any[];
    let basis = 0;
    let seen = false;
    for (const u of updates) {
      const d = u?.delta;
      if (String(d?.vault ?? "").toLowerCase() !== HLP_VAULT) continue;
      if (d.type === "vaultDeposit") {
        basis += Number(d.usdc);
        seen = true;
      } else if (d.type === "vaultWithdraw") {
        basis -= Number(d.requestedUsd ?? d.netWithdrawnUsd ?? 0);
      }
    }
    return seen ? basis : null;
  } catch {
    return null;
  }
}

export async function getPerformance(): Promise<Performance> {
  const [core, lending, hlp, basis] = await Promise.all([
    getCoreState(),
    getLendingState(),
    getHlpEquity(),
    hlpBasis(),
  ]);

  // Lending: interest earned = current value minus what was supplied.
  const usdc = (lending as any).tokenToState?.find((t: any) => t[0] === 0)?.[1];
  const lendBasis = usdc ? Number(usdc.supply.basis) : null;
  const lendValue = usdc ? Number(usdc.supply.value) : null;

  // Carry: funding collected on the ETH perp short. The spot leg is not marked
  // to market because the testnet spot market is mispriced.
  const eth = ((core as any).perpPositions ?? []).find((p: any) => p.coin === "ETH");
  const notional = eth ? Math.abs(Number(eth.positionValue)) : null;
  const funding = eth ? Number(eth.cumFunding?.sinceOpen) * FUNDING_EARNED_SIGN : null;

  // HLP: current equity minus what was deposited.
  const equity = Number((hlp as any).equity);

  return {
    carry: perf(notional, funding, "Funding collected on the ETH position"),
    lending: perf(
      lendBasis,
      lendBasis !== null && lendValue !== null ? lendValue - lendBasis : null,
      "Interest earned on supplied USDC",
    ),
    hlp: perf(
      basis,
      basis !== null && Number.isFinite(equity) ? equity - basis : null,
      "HLP vault equity minus deposits",
    ),
    raw: { ethCumFunding: eth ? String(eth.cumFunding?.sinceOpen) : null },
    updatedAt: new Date().toISOString(),
  };
}