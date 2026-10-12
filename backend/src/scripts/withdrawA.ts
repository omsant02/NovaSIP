import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseAbi,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const key = process.env.AKEY as `0x${string}` | undefined;
if (!key) throw new Error("AKEY missing");
const account = privateKeyToAccount(key);
if (account.address.toLowerCase() !== (process.env.WALLET_A ?? "").toLowerCase())
  throw new Error(`Key belongs to ${account.address}, not WALLET_A. Aborting.`);

const [kind, amountStr] = process.argv.slice(2);
if (!kind || !amountStr) throw new Error("usage: withdrawA.ts <usdc|SYMBOL> <amount>");

const hyperEvm = defineChain({
  id: 998,
  name: "HyperEVM testnet",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: [process.env.RPC_URL!] } },
});
const robinhood = defineChain({
  id: 46630,
  name: "Robinhood Chain testnet",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.RH_RPC_URL!] } },
});

const STOCKS: Record<string, `0x${string}`> = {
  TSLA: "0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E",
  AMZN: "0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02",
  AMD: "0x71178BAc73cBeb415514eB542a8995b82669778d",
  NFLX: "0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93",
  PLTR: "0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0",
};

const hubAbi = parseAbi(["function withdraw(uint256 amount)"]);
const rhAbi = parseAbi(["function withdraw(address token, uint256 amount)"]);

async function main() {
  const isUsdc = kind.toLowerCase() === "usdc";
  const chain = isUsdc ? hyperEvm : robinhood;
  const pub = createPublicClient({ chain, transport: http() });
  const wallet = createWalletClient({ account, chain, transport: http() });

  let hash: `0x${string}`;
  if (isUsdc) {
    const vault = process.env.VAULT as `0x${string}`;
    const { request } = await pub.simulateContract({
      account,
      address: vault,
      abi: hubAbi,
      functionName: "withdraw",
      args: [parseUnits(amountStr, 6)],
    });
    hash = await wallet.writeContract(request);
  } else {
    const token = STOCKS[kind.toUpperCase()];
    if (!token) throw new Error(`Unknown symbol ${kind}`);
    const vault = process.env.RH_VAULT as `0x${string}`;
    const { request } = await pub.simulateContract({
      account,
      address: vault,
      abi: rhAbi,
      functionName: "withdraw",
      args: [token, parseUnits(amountStr, 18)],
    });
    hash = await wallet.writeContract(request);
  }

  console.log("tx:", hash);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  console.log("status:", receipt.status);
}

main().catch((e) => {
  console.error("Failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});