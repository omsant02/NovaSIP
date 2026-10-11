import "dotenv/config";
import type { Address } from "viem";
import { getDeployedToCore, getHubPosition, getRhBalance, getRhDeployed } from "../chain/vault.js";

const A = process.env.WALLET_A as Address;
const TSLA = process.env.TOKEN_TSLA as Address;

async function main() {
  const pos = await getHubPosition(A);
  console.log("Hub position for A:");
  for (const [k, v] of Object.entries(pos)) console.log(`  ${k}: ${v.toString()}`);

  console.log("Hub deployedToCore:", (await getDeployedToCore()).toString());
  console.log("RH balance A (TSLA):", (await getRhBalance(A, TSLA)).toString());
  console.log("RH deployed (TSLA):", (await getRhDeployed(TSLA)).toString());
}

main().catch((e) => {
  console.error("Failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});