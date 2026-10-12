import type { StrategyKey } from "@/lib/api";

export const STRATEGY_ORDER: StrategyKey[] = [
  "carry",
  "lending",
  "hlp",
  "directional",
  "robinhood",
];

export const STRATEGY_LABEL: Record<StrategyKey, string> = {
  carry: "ETH carry",
  lending: "USDC lending",
  hlp: "HLP vault",
  directional: "Directional",
  robinhood: "Robinhood stocks",
};

export const STRATEGY_COLOR: Record<StrategyKey, string> = {
  carry: "#5EEAD4",
  lending: "#34CBB8",
  hlp: "#1FA896",
  directional: "#7DE8D8",
  robinhood: "#93A5FF",
};

/** live = real transactions on testnet, preview = simulated */
export const STRATEGY_LIVE: Record<StrategyKey, boolean> = {
  carry: true,
  lending: true,
  hlp: true,
  directional: false,
  robinhood: false,
};

export function money(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function signedMoney(n: number): string {
  return `${n >= 0 ? "+" : "-"}${money(Math.abs(n))}`;
}