import { setShockPct } from "../chain/priceShock.js";
import { syncExchangePrices } from "../chain/robinhood.js";

// Usage: npx tsx src/scripts/priceShock.ts -5   (exchange 5% below market)
//        npx tsx src/scripts/priceShock.ts 0    (back to market price)
const pct = Number(process.argv[2] ?? 0);
if (!Number.isFinite(pct)) throw new Error("pass a number, e.g. -5");
await setShockPct(pct);
console.log(`price shock set to ${pct}%`);
console.log(JSON.stringify(await syncExchangePrices(), null, 2));