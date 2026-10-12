const MORPHO_API = "https://api.morpho.org/graphql";
const TTL_MS = 5 * 60_000;

const QUERY = `query {
  markets(first: 100, orderBy: SupplyAssetsUsd, orderDirection: Desc, where: { chainId_in: [1] }) {
    items { loanAsset { symbol } state { supplyApy } }
  }
}`;

export type StockYield = {
  source: string;
  supplyApyPct: number | null;
  note: string;
};

let cache: { at: number; value: StockYield } | null = null;

// Reference rate: average supply APY of the 5 largest USDC markets on Morpho (Ethereum).
// The Robinhood stock-token market in this demo is simulated at this rate.
export async function getStockYield(): Promise<StockYield> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  let value: StockYield;
  try {
    const res = await fetch(MORPHO_API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: QUERY }),
      signal: AbortSignal.timeout(6_000),
    });
    const json = (await res.json()) as any;
    const rates: number[] = (json?.data?.markets?.items ?? [])
      .filter((m: any) => m?.loanAsset?.symbol === "USDC")
      .map((m: any) => Number(m?.state?.supplyApy))
      .filter((n: number) => Number.isFinite(n))
      .slice(0, 5);
    if (rates.length === 0) throw new Error("no markets returned");
    const avg = (rates.reduce((a, b) => a + b, 0) / rates.length) * 100;
    value = {
      source: "Morpho (live reference rate)",
      supplyApyPct: Math.round(avg * 100) / 100,
      note: "Average supply APY of the 5 largest USDC markets on Morpho. Stock-token lending on Robinhood Chain is simulated at this rate.",
    };
  } catch (e) {
    value = {
      source: "Morpho",
      supplyApyPct: null,
      note: `Rate unavailable: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  cache = { at: Date.now(), value };
  return value;
}

export async function withStockYield(snapshot: unknown): Promise<unknown> {
  return { ...(snapshot as object), stockYield: await getStockYield() };
}