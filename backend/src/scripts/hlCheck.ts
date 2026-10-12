import {
  OPERATOR,
  getCoreState,
  getLendingState,
  getHlpEquity,
} from "../hyperliquid/hl.js";

async function main() {
  console.log("Operator:", OPERATOR);

  console.log("\n-- Core state --");
  console.log(JSON.stringify(await getCoreState(), null, 2));

  console.log("\n-- Lending --");
  console.log(JSON.stringify(await getLendingState(), null, 2));

  console.log("\n-- HLP --");
  console.log(JSON.stringify(await getHlpEquity(), null, 2));
}

main().catch((e) => {
  console.error("Failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});