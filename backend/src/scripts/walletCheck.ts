import "dotenv/config";
import { getWalletAssets } from "../chain/walletAssets.js";

async function main() {
  const user = process.argv[2] ?? process.env.WALLET_A!;
  console.log(JSON.stringify(await getWalletAssets(user), null, 2));
}

main().catch((e) => {
  console.error("Failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});