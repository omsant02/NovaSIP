import "dotenv/config";
import { ExchangeClient, HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";

const pk = process.env.PRIVATE_KEY as `0x${string}` | undefined;
const builderAddr = process.env.BUILDER_ADDRESS as `0x${string}` | undefined;
if (!pk) throw new Error("PRIVATE_KEY missing in backend/.env");
if (!builderAddr) throw new Error("BUILDER_ADDRESS missing in backend/.env");

const wallet = privateKeyToAccount(pk);
if (wallet.address.toLowerCase() !== (process.env.WALLET_B ?? "").toLowerCase()) {
  throw new Error(`Key belongs to ${wallet.address}, not WALLET_B. Aborting.`);
}

const transport = new HttpTransport({ isTestnet: process.env.HL_TESTNET === "true" });
const info = new InfoClient({ transport });
const exchange = new ExchangeClient({ transport, wallet });

const PERP_COIN = "ETH";
const PERP_ASSET = 4;
const SIZE = "0.1";
const fmt = (n: number) => Number(n.toPrecision(5)).toString();

async function topOfBook(coin: string) {
  const book = await info.l2Book({ coin });
  const bid = Number(book?.levels?.[0]?.[0]?.px);
  const ask = Number(book?.levels?.[1]?.[0]?.px);
  if (!bid || !ask) throw new Error(`No order book for ${coin}`);
  return { bid, ask };
}

async function main() {
  console.log("User (B):", wallet.address);
  console.log("Builder (A):", builderAddr);

  // Step 1: B approves the builder fee cap (0.1%)
  const approval = await exchange.approveBuilderFee({
    builder: builderAddr!,
    maxFeeRate: "0.1%",
  });
  console.log("approveBuilderFee:", JSON.stringify(approval));

  // Step 2: short 0.1 ETH perp with the builder field attached
  const book = await topOfBook(PERP_COIN);
  const sellPx = fmt(book.bid * 0.98);
  console.log(`Shorting ${SIZE} ETH with builder fee, limit ${sellPx}`);
  const res = await exchange.order({
    orders: [
      { a: PERP_ASSET, b: false, p: sellPx, s: SIZE, r: false, t: { limit: { tif: "Ioc" } } },
    ],
    grouping: "na",
    builder: { b: builderAddr!, f: 100 },
  });
  console.log("Order result:", JSON.stringify(res));

  // Step 3: look up the fill record to see if a builder fee was charged
  const status: any = (res as any).response?.data?.statuses?.[0];
  const oid = status?.filled?.oid;
  if (oid) {
    const fills: any[] = await info.userFills({ user: wallet.address });
    const fill = fills.find((f) => f.oid === oid);
    console.log("Fill record:", JSON.stringify(fill));
  }

  // Step 4: close the short (reduce-only, no builder field)
  const book2 = await topOfBook(PERP_COIN);
  const buyPx = fmt(book2.ask * 1.02);
  const closeRes = await exchange.order({
    orders: [
      { a: PERP_ASSET, b: true, p: buyPx, s: SIZE, r: true, t: { limit: { tif: "Ioc" } } },
    ],
    grouping: "na",
  });
  console.log("Close result:", JSON.stringify(closeRes));
}

main().catch((e) => {
  console.error("Failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});