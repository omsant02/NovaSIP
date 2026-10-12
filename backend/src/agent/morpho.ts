const MORPHO_API = "https://api.morpho.org/graphql";
const ROBINHOOD_CHAIN_ID = 4663;
const TTL_MS = 5 * 60_000;
const MIN_TVL_USD = 100_000; // ignore tiny vaults
const MAX_SANE_APY = 0.3; // 30%; anything above is treated as bad data
const TOP_N = 5;

const QUERY = `query($chainId: Int!) {
  vaultV2s(first: 100, where: { chainId_in: [$chainId] }) {
    items {
      name
      asset { symbol }
      netApy
      totalAssetsUsd
    }
  }
}`;

export type MorphoVault = { name: string; apyPct: number; tvlUsd: number };

export type StockYield = {
  source: string;
  supplyApyPct: number | null;
  vaults: MorphoVault[];
  note: string;
};

let cache: { at: number; value: StockYield } | null = null;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Real net supply APY of the largest USDG vaults on Robinhood Chain (Morpho).
// The Morpho position in the demo is a mock vault on testnet that accrues at this live rate.
export async function getStockYield(): Promise<StockYield> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  let value: StockYield;
  try {
    const res = await fetch(MORPHO_API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { chainId: ROBINHOOD_CHAIN_ID } }),
      signal: AbortSignal.timeout(6_000),
    });
    const json = (await res.json()) as any;
    if (json?.errors?.length) throw new Error(String(json.errors[0]?.message ?? "GraphQL error"));

    const all: MorphoVault[] = (json?.data?.vaultV2s?.items ?? [])
      .filter((v: any) => String(v?.asset?.symbol ?? "").toUpperCase().startsWith("USDG"))
      .map((v: any) => ({
        name: String(v?.name ?? "vault"),
        apy: Number(v?.netApy),
        tvlUsd: Number(v?.totalAssetsUsd),
      }))
      .filter((v: any) => Number.isFinite(v.apy) && v.apy >= 0 && v.apy <= MAX_SANE_APY)
      .filter((v: any) => Number.isFinite(v.tvlUsd) && v.tvlUsd > 0)
      .sort((a: any, b: any) => b.tvlUsd - a.tvlUsd)
      .map((v: any) => ({
        name: v.name,
        apyPct: Math.round(v.apy * 10000) / 100,
        tvlUsd: Math.round(v.tvlUsd),
      }));

    const big = all.filter((v) => v.tvlUsd >= MIN_TVL_USD);
    const top = (big.length > 0 ? big : all).slice(0, TOP_N);
    if (top.length === 0) throw new Error("no USDG vaults returned");

    value = {
      source: "Morpho, Robinhood Chain USDG vaults (live)",
      supplyApyPct: Math.round(median(top.map((v) => v.apyPct)) * 100) / 100,
      vaults: top,
      note: "Median net APY of the largest USDG vaults on Robinhood Chain.",
    };
  } catch (e) {
    value = {
      source: "Morpho",
      supplyApyPct: null,
      vaults: [],
      note: `Rate unavailable: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  cache = { at: Date.now(), value };
  return value;
}

export async function withStockYield(snapshot: unknown): Promise<unknown> {
  return { ...(snapshot as object), stockYield: await getStockYield() };
}