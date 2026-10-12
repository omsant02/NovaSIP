import {
  openCarry,
  closeCarry,
  lendSupply,
  lendWithdraw,
  getLendingState,
  getCoreState,
} from "../hyperliquid/hl.js";

const which = process.argv[2];

async function main() {
  if (which === "carry") {
    console.log("Opening carry 0.1 ETH...");
    console.log(JSON.stringify(await openCarry("0.1"), null, 2));
    console.log("State after open:", JSON.stringify(await getCoreState(), null, 2));

    console.log("Closing carry 0.1 ETH...");
    console.log(JSON.stringify(await closeCarry("0.1"), null, 2));
    console.log("State after close:", JSON.stringify(await getCoreState(), null, 2));
  } else if (which === "lend") {
    console.log("Supplying 2 USDC...");
    console.log(JSON.stringify(await lendSupply("2")));
    console.log("Withdrawing 1 USDC (guard should allow this)...");
    console.log(JSON.stringify(await lendWithdraw("1")));
    console.log("State:", JSON.stringify(await getLendingState(), null, 2));

    console.log("Trying to withdraw 100 (guard should refuse)...");
    try {
      await lendWithdraw("100");
    } catch (e) {
      console.log("Refused as expected:", e instanceof Error ? e.message : e);
    }
  } else {
    console.log("Usage: npx tsx src/scripts/hlWriteTest.ts carry|lend");
  }
}

main().catch((e) => {
  console.error("Failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});