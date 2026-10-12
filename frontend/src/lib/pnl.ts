import type { Allocation, Performance, StrategyKey } from "@/lib/api";

// Only these strategies run for real on testnet; the rest are simulated.
const LIVE = ["carry", "lending", "hlp"] as const;

export type PnlEstimate = {
  byStrategy: Partial<Record<StrategyKey, number>>;
  total: number | null;
};

/** Applies each live strategy's real return to the user's allocated dollars. */
export function estimatePnl(
  allocation: Allocation,
  total: number,
  perf?: Performance,
): PnlEstimate {
  const byStrategy: Partial<Record<StrategyKey, number>> = {};
  if (!perf) return { byStrategy, total: null };

  let sum = 0;
  let any = false;
  for (const key of LIVE) {
    const pct = perf[key].returnPct;
    if (pct === null) continue;
    const value = (allocation[key] / 100) * total * (pct / 100);
    byStrategy[key] = value;
    sum += value;
    any = true;
  }
  return { byStrategy, total: any ? sum : null };
}