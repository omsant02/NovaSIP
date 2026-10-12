import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseAbi, type Address } from "viem";
import {
  RH_EXCHANGE,
  RH_MORPHO,
  RH_USDG,
  account,
  getRhRotation,
  getRhSurplus,
  rhBuyBackStock,
  rhCreditYield,
  rhParkUsdg,
  rhPublic,
  rhRecognizeYield,
  rhSellToUsdg,
  rhUnparkUsdg,
  rhWalletClient,
} from "./vault.js";
import {
  exchangeAbi,
  fromUnits,
  getAllTokenMeta,
  getHoldings,
  syncExchangePrices,
  type StockHolding,
} from "./robinhood.js";
import { getRhLedger, saveRhLedger, type ActionRecord, type RhLedger } from "../agent/state.js";

const usdgAbi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);
const morphoAbi = parseAbi(["function totalAssets() view returns (uint256)"]);

const MIN_TRADE_USD = 0.5; // ignore rotations smaller than this
const MAX_SELL_SLIPPAGE_PCT = 1; // revert the sale if USDG out is >1% below the quote
const YEAR_MS = 365 * 24 * 3_600_000;
const MAX_ACCRUAL_MS = 7 * 24 * 3_600_000;
const MIN_ACCRUAL_6 = 1_000n; // 0.001 USDG; smaller amounts keep accumulating
const ACCRUAL_FILE = fileURLToPath(new URL("../../data/rh-accrual.json", import.meta.url));

const FRACTION_SCALE = 1_000_000n;
const scale = (units: bigint, fraction: number) =>
  fraction >= 1 ? units : (units * BigInt(Math.floor(fraction * 1_000_000))) / FRACTION_SCALE;

const errText = (e: unknown) => (e instanceof Error ? e.message.slice(0, 160) : String(e));

async function step(
  actions: ActionRecord[],
  name: string,
  args: unknown,
  fn: () => Promise<unknown>,
): Promise<boolean> {
  try {
    const result = await fn();
    actions.push({ name, args, result, simulated: false });
    return true;
  } catch (e) {
    actions.push({ name, args, result: null, simulated: false, error: errText(e) });
    return false;
  }
}

async function quoteOut(tokenIn: Address, tokenOut: Address, amountIn: bigint): Promise<bigint> {
  return (await rhPublic.readContract({
    address: RH_EXCHANGE,
    abi: exchangeAbi,
    functionName: "getAmountOut",
    args: [tokenIn, tokenOut, amountIn],
  })) as bigint;
}

// ───────────── sell stock, park the USDG ─────────────

async function sellAndPark(h: StockHolding, units: bigint, ledger: RhLedger, actions: ActionRecord[]) {
  const expected = await quoteOut(h.token, RH_USDG, units);
  const minOut = (expected * BigInt(100 - MAX_SELL_SLIPPAGE_PCT)) / 100n;
  const args = {
    symbol: h.symbol,
    units: fromUnits(units, h.decimals),
    priceUsd: h.priceUsd,
    expectedUsdg: Number(expected) / 1e6,
  };

  const sold = await step(actions, "rh_sell", args, () => rhSellToUsdg(h.token, units, minOut));
  if (!sold) return;

  ledger.rotated[h.token] = (BigInt(ledger.rotated[h.token] ?? "0") + units).toString();
  await saveRhLedger(ledger);

  const { usdgIdle } = await getRhRotation(h.token);
  if (usdgIdle > 0n) {
    await step(actions, "rh_park", { symbol: h.symbol, usdg: Number(usdgIdle) / 1e6 }, () =>
      rhParkUsdg(h.token, usdgIdle),
    );
  }
}

// ───────────── take the USDG out, buy the stock back ─────────────

async function unwind(h: StockHolding, fraction: number, ledger: RhLedger, actions: ActionRecord[]) {
  const rot = await getRhRotation(h.token);
  const restore = scale(h.rotatedUnits, fraction);
  if (restore === 0n) return;

  const sharesToUnpark = scale(rot.parkedShares, fraction);
  const unparkedUsdg =
    rot.parkedShares > 0n ? (rot.parkedAssets * sharesToUnpark) / rot.parkedShares : 0n;
  const estimatedUsdg = rot.usdgIdle + unparkedUsdg;

  // The vault only accepts a buy-back that returns at least as many units as were sold.
  const wouldGet = await quoteOut(RH_USDG, h.token, estimatedUsdg);
  if (wouldGet < restore) {
    actions.push({
      name: "rh_buyback",
      args: { symbol: h.symbol },
      result: `waiting: buying ${h.symbol} back now would return fewer units than were sold`,
      simulated: false,
    });
    return;
  }

  if (sharesToUnpark > 0n) {
    const ok = await step(
      actions,
      "rh_unpark",
      { symbol: h.symbol, usdg: Number(unparkedUsdg) / 1e6 },
      () => rhUnparkUsdg(h.token, sharesToUnpark),
    );
    if (!ok) return;
  }

  const { usdgIdle } = await getRhRotation(h.token);
  const bought = await step(
    actions,
    "rh_buyback",
    {
      symbol: h.symbol,
      usdgSpent: Number(usdgIdle) / 1e6,
      unitsRestored: fromUnits(restore, h.decimals),
      priceUsd: h.priceUsd,
    },
    () => rhBuyBackStock(h.token, usdgIdle, restore),
  );
  if (bought) {
    ledger.rotated[h.token] = (BigInt(ledger.rotated[h.token] ?? "0") - restore).toString();
    await saveRhLedger(ledger);
  }
}

// Move the user's rotated amount (stock sold into USDG and lent on Morpho) to the target.
export async function rotateToTarget(user: Address, targetRotatedUsd: number): Promise<ActionRecord[]> {
  const actions: ActionRecord[] = [];

  const px = await syncExchangePrices();
  if (px.updated.length > 0) {
    actions.push({ name: "rh_price_sync", args: px.updated.map((u) => u.symbol), result: px.updated, simulated: false });
  }
  for (const e of px.errors) actions.push({ name: "rh_price_sync", args: null, result: null, simulated: false, error: e });

  const { holdings, heldUsd, rotatedUsd } = await getHoldings(user);
  const diff = targetRotatedUsd - rotatedUsd;
  if (Math.abs(diff) < MIN_TRADE_USD) return actions;

  const ledger = await getRhLedger();

  if (diff > 0) {
    if (heldUsd <= 0) return actions;
    const fraction = Math.min(1, diff / heldUsd);
    for (const h of holdings) {
      if (h.heldUnits === 0n || h.priceUsd === null) continue;
      const units = scale(h.heldUnits, fraction);
      if (units === 0n || fromUnits(units, h.decimals) * h.priceUsd < MIN_TRADE_USD) continue;
      await sellAndPark(h, units, ledger, actions);
    }
  } else {
    if (rotatedUsd <= 0) return actions;
    const fraction = Math.min(1, -diff / rotatedUsd);
    for (const h of holdings) {
      if (h.rotatedUnits === 0n || h.priceUsd === null) continue;
      await unwind(h, fraction, ledger, actions);
    }
  }
  return actions;
}

// Per-stock rotation: rotatePct[SYMBOL] is the percent of that holding that should sit in USDG.
// Stocks missing from the map are left as they are.
export async function rotateBySymbol(
  user: Address,
  rotatePct: Record<string, number>,
): Promise<ActionRecord[]> {
  const actions: ActionRecord[] = [];

  const px = await syncExchangePrices();
  if (px.updated.length > 0) {
    actions.push({ name: "rh_price_sync", args: px.updated.map((u) => u.symbol), result: px.updated, simulated: false });
  }
  for (const e of px.errors) actions.push({ name: "rh_price_sync", args: null, result: null, simulated: false, error: e });

  const { holdings } = await getHoldings(user);
  const ledger = await getRhLedger();

  for (const h of holdings) {
    const pct = rotatePct[h.symbol.toUpperCase()];
    if (pct === undefined || h.units === 0n || h.priceUsd === null) continue;

    const desired = scale(h.units, Math.min(100, Math.max(0, pct)) / 100);
    if (desired > h.rotatedUnits) {
      const wanted = desired - h.rotatedUnits;
      const units = wanted > h.heldUnits ? h.heldUnits : wanted;
      if (units > 0n && fromUnits(units, h.decimals) * h.priceUsd >= MIN_TRADE_USD) {
        await sellAndPark(h, units, ledger, actions);
      }
    } else if (desired < h.rotatedUnits) {
      const back = h.rotatedUnits - desired;
      if (fromUnits(back, h.decimals) * h.priceUsd >= MIN_TRADE_USD) {
        await unwind(h, Number(back) / Number(h.rotatedUnits), ledger, actions);
      }
    }
  }
  return actions;
}

// ───────────── Morpho yield (mock vault, real rate) ─────────────

async function readLastAccrual(): Promise<number | null> {
  try {
    return Number(JSON.parse(await fs.readFile(ACCRUAL_FILE, "utf8")).lastAt);
  } catch {
    return null;
  }
}

async function writeLastAccrual(at: number) {
  await fs.mkdir(fileURLToPath(new URL("../../data/", import.meta.url)), { recursive: true });
  await fs.writeFile(ACCRUAL_FILE, JSON.stringify({ lastAt: at }));
}

// The mock Morpho vault earns nothing by itself. Send it USDG at the real Morpho vault APY,
// sized to the time since the last accrual, so the share price rises like the real one.
export async function accrueMorphoYield(apyPct: number | null): Promise<ActionRecord | null> {
  if (apyPct === null || apyPct <= 0) return null;
  const now = Date.now();
  const last = await readLastAccrual();
  if (last === null) {
    await writeLastAccrual(now);
    return null;
  }

  const assets = (await rhPublic.readContract({
    address: RH_MORPHO,
    abi: morphoAbi,
    functionName: "totalAssets",
  })) as bigint;
  if (assets === 0n) {
    await writeLastAccrual(now);
    return null;
  }

  const elapsed = Math.min(now - last, MAX_ACCRUAL_MS);
  const amount6 = BigInt(Math.floor(Number(assets) * (apyPct / 100) * (elapsed / YEAR_MS)));
  if (amount6 < MIN_ACCRUAL_6) return null;

  const args = { apyPct, usdg: Number(amount6) / 1e6, elapsedHours: Math.round(elapsed / 36_000) / 100 };
  try {
    const bal = (await rhPublic.readContract({
      address: RH_USDG,
      abi: usdgAbi,
      functionName: "balanceOf",
      args: [account.address],
    })) as bigint;
    if (bal < amount6) throw new Error("operator wallet has too little USDG to fund yield");

    const hash = await rhWalletClient.writeContract({
      address: RH_USDG,
      abi: usdgAbi,
      functionName: "transfer",
      args: [RH_MORPHO, amount6],
    });
    const receipt = await rhPublic.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("accrual transfer reverted");
    await writeLastAccrual(now);
    return { name: "rh_accrue", args, result: hash, simulated: false };
  } catch (e) {
    return { name: "rh_accrue", args, result: null, simulated: false, error: errText(e) };
  }
}

// ───────────── gains become the user's yield ─────────────

// Surplus stock (cheaper re-entry plus Morpho yield) is recognised and credited to the user,
// who can then claim it from the vault. The demo assumes one active depositor per token.
export async function creditSurplusYield(user: Address): Promise<ActionRecord[]> {
  const actions: ActionRecord[] = [];
  for (const m of await getAllTokenMeta()) {
    const surplus = await getRhSurplus(m.token);
    if (surplus === 0n) continue;
    const args = { symbol: m.symbol, units: fromUnits(surplus, m.decimals) };
    const ok = await step(actions, "rh_recognize_yield", args, () => rhRecognizeYield(m.token, surplus));
    if (ok) await step(actions, "rh_credit_yield", args, () => rhCreditYield(user, m.token, surplus));
  }
  return actions;
}