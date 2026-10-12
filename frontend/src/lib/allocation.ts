import type { StrategyKey } from "@/lib/api";

export const STRATEGY_ORDER: StrategyKey[] = [
  "carry",
  "lending",
  "hlp",
  "directional",
  "stocks",
  "robinhood",
];

export const STRATEGY_LABEL: Record<StrategyKey, string> = {
  carry: "Delta-neutral carry",
  lending: "USDC lending",
  hlp: "HLP vault",
  directional: "Directional",
  stocks: "Stock tokens (held)",
  robinhood: "Stocks in USDG on Morpho",
};

export const STRATEGY_COLOR: Record<StrategyKey, string> = {
  carry: "#5EEAD4",
  lending: "#34CBB8",
  hlp: "#1FA896",
  directional: "#7DE8D8",
  stocks: "#F2C879",
  robinhood: "#93A5FF",
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