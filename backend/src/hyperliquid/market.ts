import { HttpTransport, InfoClient } from "@nktkas/hyperliquid";

// Public read-only data from mainnet (testnet markets are not realistic signals).
const info = new InfoClient({ transport: new HttpTransport({ isTestnet: false }) });

export const DEFAULT_COINS = ["ETH", "BTC", "SOL"];

export type FundingRow = {
  coin: string;
  markPx: number;
  hourlyFunding: number; // decimal per hour, as reported by the API (assumed hourly)
  annualizedPct: number; // hourly * 24 * 365 * 100
  openInterest: number;
  dayVolumeUsd: number;
};

export async function getFundingSnapshot(coins: string[] = DEFAULT_COINS): Promise<FundingRow[]> {
  const [meta, ctxs] = await info.metaAndAssetCtxs();
  const rows: FundingRow[] = [];
  for (const coin of coins) {
    const i = meta.universe.findIndex((u) => u.name === coin);
    if (i < 0) continue;
    const c = ctxs[i];
    const hourly = Number(c.funding);
    rows.push({
      coin,
      markPx: Number(c.markPx),
      hourlyFunding: hourly,
      annualizedPct: hourly * 24 * 365 * 100,
      openInterest: Number(c.openInterest),
      dayVolumeUsd: Number(c.dayNtlVlm),
    });
  }
  return rows;
}

export type RangeSignal = {
  coin: string;
  price: number;
  high1y: number;
  low1y: number;
  drawdownFromHighPct: number; // how far below the 1y high
  aboveLowPct: number; // how far above the 1y low
  positionInRangePct: number; // 0 = at low, 100 = at high
  label: "deep-discount" | "mid-range" | "near-high";
};

// Heuristic only (not backtested): distance from the 1-year high and low from daily candles.
export async function getRangeSignal(coin: string, days = 365): Promise<RangeSignal> {
  const endTime = Date.now();
  const startTime = endTime - days * 24 * 60 * 60 * 1000;
  const candles = await info.candleSnapshot({ coin, interval: "1d", startTime, endTime });
  if (!candles.length) throw new Error(`No candles for ${coin}`);

  const highs = candles.map((c) => Number(c.h));
  const lows = candles.map((c) => Number(c.l));
  const high1y = Math.max(...highs);
  const low1y = Math.min(...lows);
  const price = Number(candles[candles.length - 1].c);

  const drawdownFromHighPct = ((high1y - price) / high1y) * 100;
  const aboveLowPct = ((price - low1y) / low1y) * 100;
  const positionInRangePct = ((price - low1y) / (high1y - low1y)) * 100;

  let label: RangeSignal["label"] = "mid-range";
  if (drawdownFromHighPct >= 40) label = "deep-discount";
  else if (drawdownFromHighPct <= 10) label = "near-high";

  return { coin, price, high1y, low1y, drawdownFromHighPct, aboveLowPct, positionInRangePct, label };
}