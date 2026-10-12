import "dotenv/config";
import { ExchangeClient, HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";

const pk = process.env.PRIVATE_KEY as `0x${string}` | undefined;
if (!pk) throw new Error("PRIVATE_KEY missing in backend/.env");

const wallet = privateKeyToAccount(pk);
if (
  wallet.address.toLowerCase() !== (process.env.WALLET_B ?? "").toLowerCase()
) {
  throw new Error(`Key belongs to ${wallet.address}, not WALLET_B. Aborting.`);
}

export const OPERATOR = wallet.address;

const transport = new HttpTransport({
  isTestnet: process.env.HL_TESTNET === "true",
});
const info = new InfoClient({ transport });
const exchange = new ExchangeClient({ transport, wallet });

// ---- constants (same as the verified scripts) ----
const SPOT_COIN = "@1137"; // UETH/USDC
const SPOT_ASSET = 11137; // 10000 + 1137
const SPOT_TOKEN = "UETH";
const PERP_COIN = "ETH";
const PERP_ASSET = 4;
const USDC_TOKEN = 0;
const HLP_VAULT = "0xa15099a30bbf2e68942d6f4c43d70d04faeab0a0";
const BUILDER = process.env.BUILDER_ADDRESS as `0x${string}` | undefined;
const BUILDER_FEE = 100; // tenths of a basis point = 0.1%
const MIN_LEND_REMAINDER = 1; // API rejected a full withdraw: "Minimum amount supplied is $1"

// Hyperliquid prices: at most 5 significant figures
const fmt = (n: number) => Number(n.toPrecision(5)).toString();

async function topOfBook(coin: string) {
  const book = await info.l2Book({ coin });
  const bid = Number(book?.levels?.[0]?.[0]?.px);
  const ask = Number(book?.levels?.[1]?.[0]?.px);
  if (!bid || !ask) throw new Error(`No order book for ${coin}`);
  return { bid, ask };
}

// Throws if any order status carries an error, otherwise returns the statuses.
function checkOrder(label: string, res: unknown) {
  const statuses = (res as any)?.response?.data?.statuses ?? [];
  for (const s of statuses) {
    if (s?.error) throw new Error(`${label}: ${s.error}`);
  }
  return statuses;
}

// ---------------- read ----------------

export async function getCoreState() {
  const spot = await info.spotClearinghouseState({ user: OPERATOR });
  const balances = spot.balances
    .filter((b) => Number(b.total) > 0)
    .map((b) => ({ coin: b.coin, total: b.total, hold: b.hold }));
  let perpPositions: unknown[] = [];
  try {
    const perp = await info.clearinghouseState({ user: OPERATOR });
    perpPositions = perp.assetPositions.map((p) => p.position);
  } catch (e) {
    perpPositions = [{ error: e instanceof Error ? e.message : String(e) }];
  }
  return { account: OPERATOR, balances, perpPositions };
}

export async function getLendingState() {
  return info.borrowLendUserState({ user: OPERATOR });
}

export async function getHlpEquity() {
  const all = await info.userVaultEquities({ user: OPERATOR });
  const hlp = all.find(
    (v) => v.vaultAddress.toLowerCase() === HLP_VAULT.toLowerCase(),
  );
  return hlp ?? null; // { vaultAddress, equity, lockedUntilTimestamp } or null
}

// ---------------- delta-neutral carry ----------------

export async function openCarry(sizeEth: string) {
  const spot = await topOfBook(SPOT_COIN);
  const perp = await topOfBook(PERP_COIN);

  const buyRes = await exchange.order({
    orders: [
      {
        a: SPOT_ASSET,
        b: true,
        p: fmt(spot.ask * 1.02),
        s: sizeEth,
        r: false,
        t: { limit: { tif: "Ioc" } },
      },
    ],
    grouping: "na",
  });
  const spotStatuses = checkOrder("spot buy", buyRes);

  const shortRes = await exchange.order({
    orders: [
      {
        a: PERP_ASSET,
        b: false,
        p: fmt(perp.bid * 0.98),
        s: sizeEth,
        r: false,
        t: { limit: { tif: "Ioc" } },
      },
    ],
    grouping: "na",
    ...(BUILDER ? { builder: { b: BUILDER, f: BUILDER_FEE } } : {}),
  });
  const perpStatuses = checkOrder("perp short", shortRes);

  return { spot: spotStatuses, perp: perpStatuses };
}

export async function closeCarry(perpSizeEth: string) {
  const perp = await topOfBook(PERP_COIN);
  const spot = await topOfBook(SPOT_COIN);

  const perpRes = await exchange.order({
    orders: [
      {
        a: PERP_ASSET,
        b: true,
        p: fmt(perp.ask * 1.02),
        s: perpSizeEth,
        r: true,
        t: { limit: { tif: "Ioc" } },
      },
    ],
    grouping: "na",
  });
  const perpStatuses = checkOrder("perp close", perpRes);

  const state = await info.spotClearinghouseState({ user: OPERATOR });
  const bal = state.balances.find((b) => b.coin === SPOT_TOKEN);
  const total = Number(bal?.total ?? 0);
  const spotMeta = await info.spotMeta();
  const decimals =
    spotMeta.tokens.find((t) => t.name === SPOT_TOKEN)?.szDecimals ?? 2;
  const factor = 10 ** decimals;
  const sellSize = (Math.floor(total * factor) / factor).toFixed(decimals);

  let spotStatuses: unknown[] = [];
  if (Number(sellSize) > 0) {
    const sellRes = await exchange.order({
      orders: [
        {
          a: SPOT_ASSET,
          b: false,
          p: fmt(spot.bid * 0.98),
          s: sellSize,
          r: false,
          t: { limit: { tif: "Ioc" } },
        },
      ],
      grouping: "na",
    });
    spotStatuses = checkOrder("spot sell", sellRes);
  }
  return { perp: perpStatuses, spot: spotStatuses, soldUeth: sellSize };
}

// ---------------- HyperCore USDC lending ----------------

export async function lendSupply(amountUsdc: string) {
  return exchange.borrowLend({
    operation: "supply",
    token: USDC_TOKEN,
    amount: amountUsdc,
  });
}

export async function lendWithdraw(amountUsdc: string) {
  const state = await getLendingState();
  const usdc = state.tokenToState.find(([token]) => token === USDC_TOKEN)?.[1];
  const supplied = Number(usdc?.supply?.value ?? 0);
  const remaining = supplied - Number(amountUsdc);
  if (remaining < MIN_LEND_REMAINDER) {
    throw new Error(
      `Refused: withdrawing ${amountUsdc} of ${supplied} would leave ${remaining.toFixed(4)} USDC; keep at least ${MIN_LEND_REMAINDER}`,
    );
  }
  return exchange.borrowLend({
    operation: "withdraw",
    token: USDC_TOKEN,
    amount: amountUsdc,
  });
}

// ---------------- HLP vault (4-day lockup after each deposit) ----------------

export async function hlpDeposit(amountUsdc: number) {
  const raw = Math.round(amountUsdc * 1e6); // verified: usd is 6-decimal raw units
  return exchange.vaultTransfer({
    vaultAddress: HLP_VAULT,
    isDeposit: true,
    usd: raw,
  });
}
