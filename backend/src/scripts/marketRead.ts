import { getFundingSnapshot, getRangeSignal } from "../hyperliquid/market.js";

async function main() {
  console.log("-- Funding (mainnet) --");
  console.log(JSON.stringify(await getFundingSnapshot(), null, 2));

  console.log("\n-- Range signal --");
  for (const coin of ["ETH", "BTC", "SOL"]) {
    console.log(JSON.stringify(await getRangeSignal(coin), null, 2));
  }
}

main().catch((e) => {
  console.error("Failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});