export type Tier = "conservative" | "balanced" | "aggressive";

// Illustrative yearly yields used only by the landing-page calculator.
// Real returns vary and can be lower.
export const PLANS: Record<Tier, { label: string; apy: number }> = {
  conservative: { label: "Conservative", apy: 6 },
  balanced: { label: "Balanced", apy: 10 },
  aggressive: { label: "Aggressive", apy: 15 },
};

export type PathPoint = { x: number; y: number };

export type PlanResult = {
  apy: number;
  pmt: number;
  deposited: number;
  earned: number;
  points: PathPoint[];
};

// Where the goal star sits in the path chart, in percent of its box.
export const GOAL_STAR: PathPoint = { x: 93, y: 12 };

export function calcPlan(goal: number, months: number, tier: Tier): PlanResult {
  const apy = PLANS[tier].apy;
  const r = apy / 100 / 12;
  const factor = (Math.pow(1 + r, months) - 1) / r;
  const pmt = Math.ceil(goal / factor);
  const deposited = pmt * months;
  const earned = Math.max(0, goal - deposited);

  const points: PathPoint[] = Array.from({ length: months }, (_, idx) => {
    const i = idx + 1;
    const value = (pmt * (Math.pow(1 + r, i) - 1)) / r;
    return {
      x: 5 + (i / months) * 86,
      y: 88 - Math.min(1, value / goal) * 76,
    };
  });

  return { apy, pmt, deposited, earned, points };
}