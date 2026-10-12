import type {
  Allocation,
  Performance,
  RhStatus,
  StrategyKey,
} from "@/lib/api";

// These strategies report a measured return from Hyperliquid positions.
const MEASURED = ["carry", "lending", "hlp"] as const;

export type PnlEstimate = {
  byStrategy: Partial<Record<StrategyKey, number>>;
  total: number | null;
};

/**
 * Applies each Hyperliquid strategy's measured return to the user's allocated
 * dollars, and adds the yield already credited to the user on Robinhood Chain.
 */
export function estimatePnl(
  allocation: Allocation,
  total: number,
  perf?: Performance,
  rh?: RhStatus,
): PnlEstimate {
  const byStrategy: Partial<Record<StrategyKey, number>> = {};
  let sum = 0;
  let any = false;

  if (perf) {
    for (const key of MEASURED) {
      const pct = perf[key].returnPct;
      if (pct === null) continue;
      const value = (allocation[key] / 100) * total * (pct / 100);
      byStrategy[key] = value;
      sum += value;
      any = true;
    }
  }

  if (rh && rh.totalUsd > 0) {
    byStrategy.robinhood = rh.claimableUsd;
    sum += rh.claimableUsd;
    any = true;
  }

  return { byStrategy, total: any ? sum : null };
}