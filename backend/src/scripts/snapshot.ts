import { createPublicClient, http, parseAbi, formatUnits } from "viem";
import fs from "fs";

const A = "0x0011D6E1FD8a043B9e4965F058e2d00901a383e7";
const B = "0x4C4d634DDE85EfcA9F498f7eF4F00A10565d8f06";
const HUB = "0x40B0BcCFfDa3FFB423ce88ca304d6cfA9A6AAb2e";
const HUSDC = "0x2B3370eE501B4a559b57D449569354196457D8Ab";
const RHV = "0x40B0BcCFfDa3FFB423ce88ca304d6cfA9A6AAb2e";
const USDG = "0x9C160b4Bb98d3d307ceaB34c48065c0205DA0977";
const MORPHO = "0x4190Efba7348eE7F203e374E158b0c94c0da1092";
const EXCH = "0xA75818772043e6Dd9164A166EfeFE6B386Cd028A";
const STOCKS: Record<string, string> = {
  TSLA: "0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E",
  AMZN: "0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02",
  AMD: "0x71178BAc73cBeb415514eB542a8995b82669778d",
  NFLX: "0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93",
  PLTR: "0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0",
};

const hub = createPublicClient({ transport: http("https://rpc.hyperliquid-testnet.xyz/evm") });
const rh = createPublicClient({ transport: http("https://rpc.testnet.chain.robinhood.com") });

const erc = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
]);
const vaultAbi = parseAbi([
  "function rotation(address) view returns (uint256,uint256,uint256,uint256)",
  "function surplus(address) view returns (uint256)",
]);
const exAbi = parseAbi(["function quotes(address) view returns (uint256,uint256)"]);

const bal = async (c: any, t: string, who: string): Promise<bigint> =>
  c.readContract({ address: t, abi: erc, functionName: "balanceOf", args: [who] });
const f = (v: bigint | undefined, d: number) => (v === undefined ? "n/a" : Number(formatUnits(v, d)).toFixed(6));
const safe = async <T>(p: Promise<T>): Promise<T | undefined> => { try { return await p; } catch { return undefined; } };

async function main() {
  const out: any = { at: new Date().toISOString() };

  out.hyperEvmUsdc = {
    walletA: f(await bal(hub, HUSDC, A), 6),
    walletB: f(await bal(hub, HUSDC, B), 6),
    hub: f(await bal(hub, HUSDC, HUB), 6),
  };

  out.rhUsdg = {
    walletA: f(await bal(rh, USDG, A), 6),
    walletB: f(await bal(rh, USDG, B), 6),
    vault: f(await bal(rh, USDG, RHV), 6),
    exchange: f(await bal(rh, USDG, EXCH), 6),
    morphoTotalAssets: f(await rh.readContract({ address: MORPHO as any, abi: erc, functionName: "totalAssets" }) as bigint, 6),
    morphoShareSupply: f(await rh.readContract({ address: MORPHO as any, abi: erc, functionName: "totalSupply" }) as bigint, 6),
    vaultHoldsMorphoShares: f(await bal(rh, MORPHO, RHV), 6),
  };

  out.stocks = {};
  for (const [sym, addr] of Object.entries(STOCKS)) {
    const rot: any = await safe(rh.readContract({ address: RHV as any, abi: vaultAbi, functionName: "rotation", args: [addr] }) as Promise<any>);
    const sur = await safe(rh.readContract({ address: RHV as any, abi: vaultAbi, functionName: "surplus", args: [addr] }) as Promise<bigint>);
    const q: any = await safe(rh.readContract({ address: EXCH as any, abi: exAbi, functionName: "quotes", args: [addr] }) as Promise<any>);
    out.stocks[sym] = {
      walletA: f(await bal(rh, addr, A), 18),
      walletB: f(await bal(rh, addr, B), 18),
      vault: f(await bal(rh, addr, RHV), 18),
      exchange: f(await bal(rh, addr, EXCH), 18),
      rotatedStock: rot ? f(rot[0], 18) : "n/a",
      usdgIdle: rot ? f(rot[1], 6) : "n/a",
      parkedAssets: rot ? f(rot[3], 6) : "n/a",
      surplus: f(sur, 18),
      exchangePriceUsd: q ? f(q[0], 6) : "n/a",
    };
  }

  console.log(JSON.stringify(out, null, 2));
  const label = process.argv[2] || "snap";
  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync(`data/snapshot-${label}.json`, JSON.stringify(out, null, 2));
  console.log(`\nsaved data/snapshot-${label}.json`);
}
main().catch((e) => { console.error(e); process.exit(1); });