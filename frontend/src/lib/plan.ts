export type Tier = "conservative" | "balanced" | "aggressive";

// Illustrative yearly yields used only by the landing-page calculator.
// Each tier shows a range; the calculator uses the middle. Returns vary and can be lower.
export const PLANS: Record<
  Tier,
  { label: string; apy: number; low: number; high: number }
> = {
  conservative: { label: "Conservative", apy: 5, low: 4, high: 6 },
  balanced: { label: "Balanced", apy: 8, low: 6, high: 10 },
  aggressive: { label: "Aggressive", apy: 12, low: 8, high: 16 },
};

export type PathPoint = { x: number; y: number };

export type PlanResult = {
  apy: number;
  low: number;
  high: number;
  pmt: number;
  deposited: number;
  earned: number;
  points: PathPoint[];
};

// Where the goal star sits in the path chart, in percent of its box.
export const GOAL_STAR: PathPoint = { x: 93, y: 12 };

export function calcPlan(goal: number, months: number, tier: Tier): PlanResult {
  const { apy, low, high } = PLANS[tier];
  const r = apy / 100 / 12;
  // Deposits are made at the start of each month and start earning straight away.
  const growth = (n: number) => ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
  const pmt = Math.ceil(goal / growth(months));
  const deposited = pmt * months;
  const earned = Math.max(0, goal - deposited);

  const points: PathPoint[] = Array.from({ length: months }, (_, idx) => {
    const i = idx + 1;
    return {
      x: 5 + (i / months) * 86,
      y: 88 - Math.min(1, (pmt * growth(i)) / goal) * 76,
    };
  });

  return { apy, low, high, pmt, deposited, earned, points };
}