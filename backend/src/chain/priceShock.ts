import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";

// Demo control: shifts the mock exchange price by a percent versus the live market price,
// so a dip (or a rally) can be shown on demand. 0 means the exchange follows the market.
const DIR = fileURLToPath(new URL("../../data/", import.meta.url));
const FILE = DIR + "price-shock.json";

export async function getShockPct(): Promise<number> {
  try {
    const n = Number(JSON.parse(await fs.readFile(FILE, "utf8")).pct);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export async function setShockPct(pct: number) {
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify({ pct }));
}