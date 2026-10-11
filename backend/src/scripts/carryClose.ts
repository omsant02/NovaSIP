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
const SPOT_ASSET = 11137;
const SPOT_TOKEN = "UETH";
const PERP_COIN = "ETH";
const PERP_ASSET = 4;
const PERP_CLOSE_SIZE = "0.1";

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

  const perp = await topOfBook(PERP_COIN);
  const spot = await topOfBook(SPOT_COIN);

  // Leg 1: close the perp short with a reduce-only buy (IOC, priced 2% through the ask)
  const buyPx = fmt(perp.ask * 1.02);
  console.log(`Closing perp short: buy ${PERP_CLOSE_SIZE} ETH reduce-only, limit ${buyPx}`);
  const perpRes = await exchange.order({
    orders: [
      { a: PERP_ASSET, b: true, p: buyPx, s: PERP_CLOSE_SIZE, r: true, t: { limit: { tif: "Ioc" } } },
    ],
    grouping: "na",
  });
  console.log("Perp close result:", JSON.stringify(perpRes));

  // Leg 2: sell the whole spot UETH balance (rounded down to the token's size decimals)
  const state = await info.spotClearinghouseState({ user: wallet.address });
  const bal = state.balances.find((b) => b.coin === SPOT_TOKEN);
  const total = Number(bal?.total ?? 0);
  const spotMeta = await info.spotMeta();
  const decimals = spotMeta.tokens.find((t) => t.name === SPOT_TOKEN)?.szDecimals ?? 2;
  const factor = 10 ** decimals;
  const sellSize = (Math.floor(total * factor) / factor).toFixed(decimals);
  console.log(`UETH balance ${total}, selling ${sellSize} (szDecimals ${decimals})`);

  if (Number(sellSize) > 0) {
    const sellPx = fmt(spot.bid * 0.98);
    console.log(`Selling spot UETH, limit ${sellPx}`);
    const spotRes = await exchange.order({
      orders: [
        { a: SPOT_ASSET, b: false, p: sellPx, s: sellSize, r: false, t: { limit: { tif: "Ioc" } } },
      ],
      grouping: "na",
    });
    console.log("Spot sell result:", JSON.stringify(spotRes));
  } else {
    console.log("No UETH to sell.");
  }
}

main().catch((e) => {
  console.error("Failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});