import "dotenv/config";
import { HttpTransport, InfoClient } from "@nktkas/hyperliquid";

const user = process.env.WALLET_B as `0x${string}` | undefined;
if (!user) throw new Error("WALLET_B missing in .env");

const transport = new HttpTransport({ isTestnet: process.env.HL_TESTNET === "true" });
const info = new InfoClient({ transport });

async function main() {
  console.log("User:", user);

  const spot = await info.spotClearinghouseState({ user: user! });
  console.log("SPOT balances:");
  for (const b of spot.balances) {
    console.log(`  ${b.coin}: total=${b.total} hold=${b.hold}`);
  }

  const perps = await info.clearinghouseState({ user: user! });
  console.log("PERPS accountValue:", perps.marginSummary.accountValue);
  console.log("PERPS open positions:", perps.assetPositions.length);

  const mids = await info.allMids();
  console.log("BTC mid:", mids["BTC"], "| ETH mid:", mids["ETH"]);

  const meta = await info.meta();
  const ethPerp = meta.universe.findIndex((u) => u.name === "ETH");
  console.log("ETH perp asset id:", ethPerp);

  const spotMeta = await info.spotMeta();
  const tokenName = (i: number) => spotMeta.tokens.find((t) => t.index === i)?.name;
  for (const pair of spotMeta.universe) {
    const [base, quote] = pair.tokens;
    const baseName = tokenName(base);
    if (baseName && /ETH/i.test(baseName)) {
      console.log(
        `SPOT pair ${pair.name}: ${baseName}/${tokenName(quote)} index=${pair.index} assetId=${10000 + pair.index}`
      );
    }
  }
}

main().catch((e) => {
  console.error("Failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});