export type Tier = "conservative" | "balanced" | "aggressive";
export type Strategy =
  | "carry"
  | "lending"
  | "hlp"
  | "directional"
  | "stocks"
  | "robinhood";

// Allocation = percent of the user's deployable funds per strategy (0-100). The remainder is idle cash.
//  - stocks:     funds held as stock tokens on Robinhood Chain (directional alpha)
//  - robinhood:  stock rotated into USDG and lent on Morpho (Robinhood Chain)
export type Allocation = Record<Strategy, number>;

export const STRATEGIES: Strategy[] = [
  "carry",
  "lending",
  "hlp",
  "directional",
  "stocks",
  "robinhood",
];

// Strategies that live on Hyperliquid (hub USDC) and on Robinhood Chain (stock tokens).
export const HL_STRATEGIES: Strategy[] = ["carry", "lending", "hlp", "directional"];
export const RH_STRATEGIES: Strategy[] = ["stocks", "robinhood"];

// Max percent of the portfolio per strategy, per risk tier.
// stocks (price risk) is limited by tier; robinhood (USDG lending on Morpho) is low-risk.
export const CAPS: Record<Tier, Allocation> = {
  conservative: {
    carry: 40,
    lending: 60,
    hlp: 5,
    directional: 0,
    stocks: 40,
    robinhood: 100,
  },
  balanced: {
    carry: 40,
    lending: 40,
    hlp: 15,
    directional: 10,
    stocks: 70,
    robinhood: 100,
  },
  aggressive: {
    carry: 40,
    lending: 30,
    hlp: 25,
    directional: 25,
    stocks: 100,
    robinhood: 100,
  },
};

export const MAX_CHANGE_PER_CYCLE_PCT = 20; // total percent of the portfolio that may move in one cycle
export const MIN_ORDER_USD = 10; // Hyperliquid minimum order value (assumed from the docs error)
export const MIN_LEND_REMAINDER_USD = 1; // lending API rejects leaving less than $1 supplied

// The only actions the agent may ever execute.
export const ALLOWED_ACTIONS = [
  "open_carry",
  "close_carry",
  "lend_supply",
  "lend_withdraw",
  "hlp_deposit",
  "rh_sell",
  "rh_park",
  "rh_unpark",
  "rh_buyback",
  "hold",
] as const;
export type Action = (typeof ALLOWED_ACTIONS)[number];

export function isAllowedAction(name: string): name is Action {
  return (ALLOWED_ACTIONS as readonly string[]).includes(name);
}

export type Verdict = { approved: boolean; reasons: string[] };

const EPS = 0.01;

export type ProposalOpts = {
  initial?: boolean;
  // Share of the user's funds that sits on each chain. When given, the strategies
  // on that chain cannot add up to more than the funds actually deposited there.
  rhSharePct?: number;
  hubSharePct?: number;
};

// The AI proposes a target allocation; this code approves or rejects it with reasons.
export function checkProposal(
  tier: Tier,
  current: Allocation,
  target: Allocation,
  opts: ProposalOpts = {},
): Verdict {
  const reasons: string[] = [];
  const caps = CAPS[tier];

  let total = 0;
  let moved = 0;
  for (const s of STRATEGIES) {
    const t = target[s];
    if (!Number.isFinite(t) || t < 0) {
      reasons.push(`${s}: invalid target ${t}`);
      continue;
    }
    total += t;
    if (t > caps[s] + EPS)
      reasons.push(`${s}: ${t}% exceeds the ${tier} cap of ${caps[s]}%`);
    moved += Math.max(0, t - (current[s] ?? 0));
  }

  if (total > 100 + EPS)
    reasons.push(`total allocation ${total.toFixed(2)}% exceeds 100%`);
  if (!opts.initial && moved > MAX_CHANGE_PER_CYCLE_PCT + EPS) {
    reasons.push(
      `moves ${moved.toFixed(2)}% in one cycle; the limit is ${MAX_CHANGE_PER_CYCLE_PCT}%`,
    );
  }
  // HLP is locked for 4 days after each deposit, so it can only grow.
  if (target.hlp < (current.hlp ?? 0) - EPS)
    reasons.push("hlp: cannot be reduced (illiquid, 4-day lockup)");

  // Funds can only be used on the chain they were deposited on.
  if (opts.rhSharePct !== undefined) {
    const rh = RH_STRATEGIES.reduce((a, s) => a + (target[s] || 0), 0);
    if (rh > opts.rhSharePct + EPS)
      reasons.push(
        `stocks + robinhood: ${rh.toFixed(2)}% exceeds the ${opts.rhSharePct.toFixed(2)}% of funds deposited on Robinhood Chain`,
      );
  }
  if (opts.hubSharePct !== undefined) {
    const hl = HL_STRATEGIES.reduce((a, s) => a + (target[s] || 0), 0);
    if (hl > opts.hubSharePct + EPS)
      reasons.push(
        `Hyperliquid strategies: ${hl.toFixed(2)}% exceeds the ${opts.hubSharePct.toFixed(2)}% of funds deposited on Hyperliquid`,
      );
  }

  return { approved: reasons.length === 0, reasons };
}

export function checkOrderSize(usd: number): Verdict {
  return usd >= MIN_ORDER_USD
    ? { approved: true, reasons: [] }
    : {
        approved: false,
        reasons: [`order value $${usd} is below the $${MIN_ORDER_USD} minimum`],
      };
}