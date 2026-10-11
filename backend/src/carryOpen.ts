import "dotenv/config";
import { ExchangeClient, HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";

const pk = process.env.PRIVATE_KEY as `0x${string}` | undefined;
if (!pk) throw new Error("PRIVATE_KEY missing in backend/.env");

const wallet = privateKeyToAccount(pk);
if (wallet.address.toLowerCase() !== (process.env.WALLET_B ?? "").toLowerCase()) {
  throw new Error(`Key belongs to ${wallet.address}, not WALLET_B. Aborting.`);
}

const transport = new HttpTransport({ isTestnet: process.env.HL_TESTNET === "true" });
const info = new InfoClient({ transport });
const exchange = new ExchangeClient({ transport, wallet });

const SPOT_COIN = "@1137"; // UETH/USDC
const SPOT_ASSET = 11137; // 10000 + 1137
const PERP_COIN = "ETH";
const PERP_ASSET = 4;
const SIZE = "0.1";

// Hyperliquid prices: at most 5 significant figures
const fmt = (n: number) => Number(n.toPrecision(5)).toString();

async function topOfBook(coin: string) {
  const book = await info.l2Book({ coin });
  const bid = Number(book?.levels?.[0]?.[0]?.px);
  const ask = Number(book?.levels?.[1]?.[0]?.px);
  if (!bid || !ask) throw new Error(`No order book for ${coin}`);
  return { bid, ask };
}

async function main() {
  console.log("Account:", wallet.address);

  const spot = await topOfBook(SPOT_COIN);
  const perp = await topOfBook(PERP_COIN);
  console.log("Spot UETH/USDC:", spot);
  console.log("Perp ETH:", perp);

  // Leg 1: buy spot UETH (IOC limit priced 2% through the ask)
  const buyPx = fmt(spot.ask * 1.02);
  console.log(`Buying ${SIZE} UETH spot, limit ${buyPx}`);
  const buyRes = await exchange.order({
    orders: [
      { a: SPOT_ASSET, b: true, p: buyPx, s: SIZE, r: false, t: { limit: { tif: "Ioc" } } },
    ],
    grouping: "na",
  });
  console.log("Spot buy result:", JSON.stringify(buyRes));

  // Leg 2: short ETH perp (IOC limit priced 2% through the bid)
  const sellPx = fmt(perp.bid * 0.98);
  console.log(`Shorting ${SIZE} ETH perp, limit ${sellPx}`);
  const shortRes = await exchange.order({
    orders: [
      { a: PERP_ASSET, b: false, p: sellPx, s: SIZE, r: false, t: { limit: { tif: "Ioc" } } },
    ],
    grouping: "na",
  });
  console.log("Perp short result:", JSON.stringify(shortRes));
}

main().catch((e) => {
  console.error("Failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});