export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

export type StrategyKey =
  | "carry"
  | "lending"
  | "hlp"
  | "directional"
  | "robinhood";

export type Allocation = Record<StrategyKey, number>;

export type Tier = "conservative" | "balanced" | "aggressive";

export type DecisionAction = {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
  simulated: boolean;
};

export type Decision = {
  time: string;
  tier: Tier;
  from: Allocation;
  to: Allocation;
  approved: boolean;
  reasons: string[];
  reasoning: string;
  actions: DecisionAction[];
};

export type Profile = {
  goalName: string;
  targetUsd: number;
  goalDate: string;
  tier: Tier;
  notes: string[];
};

export type NovaState = {
  user: string;
  book: {
    tier: Tier;
    totalUsd: number;
    allocation: Allocation;
    updatedAt: string;
  };
  profile: Profile;
  hub: {
    hubPrincipal: string;
    rhPrincipal: string;
    yieldOwed: string;
    totalYieldEarned: string;
    pendingYield: string;
    goalDate: string;
  };
  decisions: Decision[];
  running: boolean;
  lastRun: string | null;
  keeperIntervalMin: number;
};

/** USDC amounts come from the backend as 6-decimal integer strings. */
export function fromUsdc(raw: string): number {
  return Number(raw) / 1_000_000;
}

export async function fetchState(user?: string): Promise<NovaState> {
  const qs = user ? `?user=${user}` : "";
  const res = await fetch(`${API_URL}/api/state${qs}`);
  if (!res.ok) throw new Error(`State request failed (${res.status})`);
  return res.json();
}