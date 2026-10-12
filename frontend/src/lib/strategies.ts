export type Chain = "hyperliquid" | "robinhood";

export const CHAINS: Record<Chain, { label: string; dotClass: string }> = {
  hyperliquid: { label: "Hyperliquid", dotClass: "bg-mint" },
  robinhood: { label: "Robinhood Chain", dotClass: "bg-periwinkle" },
};

export type StrategyKey =
  | "carry"
  | "lending"
  | "hlp"
  | "directional"
  | "robinhood";

export type StrategyInfo = {
  key: StrategyKey;
  name: string;
  chain: Chain;
  blurb: string;
};

export const STRATEGY_INFO: StrategyInfo[] = [
  {
    key: "carry",
    name: "ETH carry",
    chain: "hyperliquid",
    blurb:
      "Hold ETH and short the same amount, so price swings cancel out and funding payments are the profit.",
  },
  {
    key: "lending",
    name: "USDC lending",
    chain: "hyperliquid",
    blurb:
      "Earn interest on idle dollars, withdrawable whenever you like. The steady base of every plan.",
  },
  {
    key: "hlp",
    name: "HLP vault",
    chain: "hyperliquid",
    blurb:
      "Share in the fees Hyperliquid's market-making vault earns. Higher yield, with a four-day lockup.",
  },
  {
    key: "directional",
    name: "Directional alpha",
    chain: "hyperliquid",
    blurb:
      "Accumulate when a coin sits far below its yearly high, and trim when it's stretched. Only in Balanced and Aggressive plans.",
  },
  {
    key: "robinhood",
    name: "Stock-token lending",
    chain: "robinhood",
    blurb:
      "Lend the stock tokens you hold through a Morpho-style vault. Your NVDA keeps working even when you aren't trading it.",
  },
];