import type { Address } from "viem";
import { withUser } from "../agent/state.js";
import { setShockPct } from "../chain/priceShock.js";
import { creditSurplusYield, rotateBySymbol } from "../chain/rotation.js";

const user = (process.env.WALLET_A ?? "") as Address;

// usage: npx tsx src/scripts/forceUnwind.ts <shockPct> <SYMBOL>
// e.g.   npx tsx src/scripts/forceUnwind.ts -3 PLTR
const shock = Number(process.argv[2] ?? "-3");
const symbol = (process.argv[3] ?? "PLTR").toUpperCase();

async function main() {
  await setShockPct(shock);
  console.log(`Exchange price shock set to ${shock}%`);

  const actions = await withUser(user, async () => {
    const unwound = await rotateBySymbol(user, { [symbol]: 0 });
    const credited = await creditSurplusYield(user);
    return [...unwound, ...credited];
  });

  console.log(JSON.stringify(actions, null, 2));
}

main().catch((e) => {
  console.error("Failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});