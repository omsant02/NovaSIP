import "dotenv/config";
import { HttpTransport, InfoClient } from "@nktkas/hyperliquid";

const transport = new HttpTransport({ isTestnet: process.env.HL_TESTNET === "true" });
const info = new InfoClient({ transport });

const COINS = ["@878", "@1137", "ETH"];

async function main() {
  const mids = await info.allMids();
  for (const c of COINS) {
    console.log(`${c} mid:`, mids[c]);
  }

  for (const coin of COINS) {
    const book = await info.l2Book({ coin });
    const bids = book?.levels?.[0] ?? [];
    const asks = book?.levels?.[1] ?? [];
    console.log(
      `${coin} best bid: ${bids[0]?.px ?? "none"} (size ${bids[0]?.sz ?? "-"}) | best ask: ${asks[0]?.px ?? "none"} (size ${asks[0]?.sz ?? "-"})`
    );
  }
}

main().catch((e) => {
  console.error("Failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});