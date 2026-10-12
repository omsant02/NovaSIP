// Live stock quotes from Yahoo's public chart endpoint. Used to price the mock
// exchange and to give the agent real market context (price, day move, 52-week range).
const TTL_MS = 60_000;
const TIMEOUT_MS = 6_000;

export type StockQuote = {
  symbol: string;
  price: number;
  changePct: number | null; // today's move
  high52w: number | null;
  low52w: number | null;
  rangePct: number | null; // where the price sits in the 52-week range, 0 = low, 100 = high
  at: string;
};

const cache = new Map<string, { at: number; quote: StockQuote }>();

async function fetchQuote(symbol: string): Promise<StockQuote> {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
    {
      headers: { "user-agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status} for ${symbol}`);
  const json = (await res.json()) as any;
  const meta = json?.chart?.result?.[0]?.meta;
  const price = Number(meta?.regularMarketPrice);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`no price for ${symbol}`);
  }

  const num = (v: unknown) => (Number.isFinite(Number(v)) && v != null ? Number(v) : null);
  const high = num(meta?.fiftyTwoWeekHigh);
  const low = num(meta?.fiftyTwoWeekLow);
  const rangePct =
    high != null && low != null && high > low
      ? Math.round(((price - low) / (high - low)) * 1000) / 10
      : null;
  const change = num(meta?.regularMarketChangePercent);

  return {
    symbol,
    price,
    changePct: change != null ? Math.round(change * 100) / 100 : null,
    high52w: high,
    low52w: low,
    rangePct,
    at: new Date().toISOString(),
  };
}

// One quote, cached for a minute. If Yahoo fails, the last good quote is returned.
export async function getStockQuote(symbol: string): Promise<StockQuote> {
  const key = symbol.toUpperCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.quote;
  try {
    const quote = await fetchQuote(key);
    cache.set(key, { at: Date.now(), quote });
    return quote;
  } catch (e) {
    if (hit) return hit.quote;
    throw e;
  }
}

// Many quotes at once; a symbol that fails comes back as null.
export async function getStockQuotes(
  symbols: string[],
): Promise<Record<string, StockQuote | null>> {
  const entries = await Promise.all(
    symbols.map(async (s) => {
      try {
        return [s.toUpperCase(), await getStockQuote(s)] as const;
      } catch {
        return [s.toUpperCase(), null] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}