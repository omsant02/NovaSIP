import { formatUnits, parseAbi, parseUnits, type Address } from "viem";
import {
  RH_EXCHANGE,
  getHubPosition,
  getRhBalance,
  getRhTokens,
  recordRHDeposit,
  recordRHWithdrawal,
  rhPublic,
  rhWalletClient,
} from "./vault.js";
import { getStockQuotes } from "./prices.js";
import { getRhLedger, saveRhLedger } from "../agent/state.js";
import type { Tier } from "../agent/guardrails.js";
import { getShockPct } from "./priceShock.js";

const erc20Abi = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);

export const exchangeAbi = parseAbi([
  "function setPrice(address token, uint256 price)",
  "function quotes(address) view returns (uint192 price, uint64 updatedAt)",
  "function getAmountOut(address tokenIn, address tokenOut, uint256 amountIn) view returns (uint256)",
]);

const TIER_INDEX: Record<Tier, number> = {
  conservative: 0,
  balanced: 1,
  aggressive: 2,
};
const PRICE_REFRESH_MS = 6 * 3_600_000; // re-set a price at least this often
const PRICE_MOVE_THRESHOLD = 0.002; // or when it moved more than 0.2%
const MIN_SYNC_USD = 0.01;

export type TokenMeta = { token: Address; symbol: string; decimals: number };

export type StockHolding = TokenMeta & {
  units: bigint; // user's units in the vault books (includes rotated)
  rotatedUnits: bigint; // units currently rotated into USDG for this user
  heldUnits: bigint; // units still held as stock
  priceUsd: number | null;
  valueUsd: number;
  heldUsd: number;
  rotatedUsd: number;
};

const metaCache = new Map<Address, TokenMeta>();

export const fromUnits = (units: bigint, decimals: number) =>
  Number(formatUnits(units, decimals));

export const toUnits = (amount: number, decimals: number) =>
  parseUnits(amount.toFixed(8), decimals);

export async function getTokenMeta(token: Address): Promise<TokenMeta> {
  const hit = metaCache.get(token);
  if (hit) return hit;
  const [symbol, decimals] = await Promise.all([
    rhPublic.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "symbol",
    }),
    rhPublic.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "decimals",
    }),
  ]);
  const meta = { token, symbol: symbol as string, decimals: Number(decimals) };
  metaCache.set(token, meta);
  return meta;
}

export async function getAllTokenMeta(): Promise<TokenMeta[]> {
  return Promise.all((await getRhTokens()).map(getTokenMeta));
}

// The user's stock tokens in the vault, valued at live prices.
export async function getHoldings(user: Address) {
  const metas = await getAllTokenMeta();
  const quotes = await getStockQuotes(metas.map((m) => m.symbol));
  const ledger = await getRhLedger();

  const holdings: StockHolding[] = await Promise.all(
    metas.map(async (m) => {
      const units = await getRhBalance(user, m.token);
      const rotatedRaw = BigInt(ledger.rotated[m.token] ?? "0");
      const rotatedUnits = rotatedRaw > units ? units : rotatedRaw;
      const heldUnits = units - rotatedUnits;
      const priceUsd = quotes[m.symbol.toUpperCase()]?.price ?? null;
      const p = priceUsd ?? 0;
      return {
        ...m,
        units,
        rotatedUnits,
        heldUnits,
        priceUsd,
        valueUsd: fromUnits(units, m.decimals) * p,
        heldUsd: fromUnits(heldUnits, m.decimals) * p,
        rotatedUsd: fromUnits(rotatedUnits, m.decimals) * p,
      };
    }),
  );

  const sum = (f: (h: StockHolding) => number) =>
    holdings.reduce((a, h) => a + f(h), 0);
  return {
    holdings,
    totalUsd: sum((h) => h.valueUsd),
    heldUsd: sum((h) => h.heldUsd),
    rotatedUsd: sum((h) => h.rotatedUsd),
  };
}

// How the user's funds split between Hyperliquid (hub USDC) and Robinhood Chain (stock tokens).
export async function getFundSplit(user: Address) {
  const [pos, rh] = await Promise.all([
    getHubPosition(user),
    getHoldings(user),
  ]);
  const hubUsd = Number(pos.hubPrincipal) / 1e6;
  const rhUsd = rh.totalUsd;
  const totalUsd = hubUsd + rhUsd;
  const pct = (v: number) => (totalUsd > 0 ? (v / totalUsd) * 100 : 0);
  return {
    hubUsd,
    rhUsd,
    totalUsd,
    hubSharePct: pct(hubUsd),
    rhSharePct: pct(rhUsd),
  };
}

// Keep the mock exchange priced at the live market price. Writes only when needed.
export async function syncExchangePrices() {
  const metas = await getAllTokenMeta();
  const quotes = await getStockQuotes(metas.map((m) => m.symbol));
  const updated: { symbol: string; priceUsd: number; hash: string }[] = [];
  const errors: string[] = [];
  const shock = await getShockPct();

  for (const m of metas) {
    const q = quotes[m.symbol.toUpperCase()];
    if (!q) {
      errors.push(`${m.symbol}: no live price`);
      continue;
    }
    try {
      const next = BigInt(Math.round(q.price * (1 + shock / 100) * 1e6));
      const [price, updatedAt] = (await rhPublic.readContract({
        address: RH_EXCHANGE,
        abi: exchangeAbi,
        functionName: "quotes",
        args: [m.token],
      })) as readonly [bigint, bigint];

      if (price !== 0n) {
        const moved = Math.abs(Number(next - price)) / Number(price);
        const age = Date.now() - Number(updatedAt) * 1000;
        if (moved < PRICE_MOVE_THRESHOLD && age < PRICE_REFRESH_MS) continue;
      }

      const hash = await rhWalletClient.writeContract({
        address: RH_EXCHANGE,
        abi: exchangeAbi,
        functionName: "setPrice",
        args: [m.token, next],
      });
      const receipt = await rhPublic.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("setPrice reverted");
      updated.push({ symbol: m.symbol, priceUsd: q.price, hash });
    } catch (e) {
      errors.push(
        `${m.symbol}: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`,
      );
    }
  }
  return { updated, errors };
}

// Mirror the user's vault deposits and withdrawals into the hub books (the vaults never
// call each other, so the operator records the USD value at the live price).
export async function syncDepositsToHub(user: Address, tier: Tier) {
  const metas = await getAllTokenMeta();
  const quotes = await getStockQuotes(metas.map((m) => m.symbol));
  const ledger = await getRhLedger();
  const done: {
    symbol: string;
    kind: "deposit" | "withdrawal";
    usd: number;
    hash: string;
  }[] = [];
  const errors: string[] = [];

  for (const m of metas) {
    const price = quotes[m.symbol.toUpperCase()]?.price;
    if (!price) continue;
    try {
      const units = await getRhBalance(user, m.token);
      const synced = BigInt(ledger.synced[m.token] ?? "0");
      if (units === synced) continue;

      if (units > synced) {
        const usd = fromUnits(units - synced, m.decimals) * price;
        if (usd < MIN_SYNC_USD) continue;
        const r = await recordRHDeposit(
          user,
          BigInt(Math.round(usd * 1e6)),
          TIER_INDEX[tier],
        );
        if (r.status !== "success") throw new Error("recordRHDeposit reverted");
        done.push({ symbol: m.symbol, kind: "deposit", usd, hash: r.hash });
      } else {
        const wanted = BigInt(
          Math.round(fromUnits(synced - units, m.decimals) * price * 1e6),
        );
        const pos = await getHubPosition(user);
        const usd6 = wanted > pos.rhPrincipal ? pos.rhPrincipal : wanted;
        if (usd6 > 0n) {
          const r = await recordRHWithdrawal(user, usd6);
          if (r.status !== "success")
            throw new Error("recordRHWithdrawal reverted");
          done.push({
            symbol: m.symbol,
            kind: "withdrawal",
            usd: Number(usd6) / 1e6,
            hash: r.hash,
          });
        }
      }
      ledger.synced[m.token] = units.toString();
      await saveRhLedger(ledger);
    } catch (e) {
      errors.push(
        `${m.symbol}: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`,
      );
    }
  }
  return { done, errors };
}
