import "dotenv/config";
import { readFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Abi,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const need = (key: string): string => {
  const v = process.env[key];
  if (!v) throw new Error(`${key} missing in backend/.env`);
  return v;
};

const loadAbi = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../abi/${name}.json`, import.meta.url), "utf8"),
  ) as Abi;

export const hubAbi = loadAbi("NovaSIPVault");
export const rhAbi = loadAbi("RHChainVault");

export const hyperEvm = defineChain({
  id: 998,
  name: "HyperEVM Testnet",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: [need("RPC_URL")] } },
});

export const robinhood = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [need("RH_RPC_URL")] } },
});

export const HUB = need("VAULT") as Address;
export const RH_VAULT = need("RH_VAULT") as Address;

const account = privateKeyToAccount(need("PRIVATE_KEY") as `0x${string}`);

const hubPublic = createPublicClient({ chain: hyperEvm, transport: http() });
const rhPublic = createPublicClient({ chain: robinhood, transport: http() });
const hubWallet = createWalletClient({
  account,
  chain: hyperEvm,
  transport: http(),
});
const rhWallet = createWalletClient({
  account,
  chain: robinhood,
  transport: http(),
});

// ---------- Reads ----------

export async function getHubPosition(user: Address) {
  return (await hubPublic.readContract({
    address: HUB,
    abi: hubAbi,
    functionName: "getPosition",
    args: [user],
  })) as {
    hubPrincipal: bigint;
    rhPrincipal: bigint;
    yieldOwed: bigint;
    totalYieldEarned: bigint;
    pendingYield: bigint;
    goalDate: bigint;
  };
}

export async function getDeployedToCore(): Promise<bigint> {
  return (await hubPublic.readContract({
    address: HUB,
    abi: hubAbi,
    functionName: "deployedToCore",
  })) as bigint;
}

export async function getRhBalance(
  user: Address,
  token: Address,
): Promise<bigint> {
  return (await rhPublic.readContract({
    address: RH_VAULT,
    abi: rhAbi,
    functionName: "balanceOf",
    args: [user, token],
  })) as bigint;
}

export async function getRhDeployed(token: Address): Promise<bigint> {
  return (await rhPublic.readContract({
    address: RH_VAULT,
    abi: rhAbi,
    functionName: "deployed",
    args: [token],
  })) as bigint;
}

// ---------- Operator writes (signed by B) ----------

export async function hubWrite(functionName: string, args: readonly unknown[]) {
  const hash = await hubWallet.writeContract({
    address: HUB,
    abi: hubAbi,
    functionName,
    args,
  });
  const receipt = await hubPublic.waitForTransactionReceipt({ hash });
  return { hash, status: receipt.status };
}

export async function rhWrite(functionName: string, args: readonly unknown[]) {
  const hash = await rhWallet.writeContract({
    address: RH_VAULT,
    abi: rhAbi,
    functionName,
    args,
  });
  const receipt = await rhPublic.waitForTransactionReceipt({ hash });
  return { hash, status: receipt.status };
}

// Convenience wrappers for the calls we already proved with cast
export const deployToCore = (amount6: bigint) =>
  hubWrite("deployToCore", [amount6]);
export const acknowledgeCoreReturn = (amount6: bigint) =>
  hubWrite("acknowledgeCoreReturn", [amount6]);
export const recordRHDeposit = (user: Address, usd6: bigint, tier: number) =>
  hubWrite("recordRHDeposit", [user, usd6, tier]);
export const recordRHWithdrawal = (user: Address, usd6: bigint) =>
  hubWrite("recordRHWithdrawal", [user, usd6]);
export const rhAllocate = (token: Address, amount: bigint) =>
  rhWrite("allocate", [token, amount]);
export const rhRecall = (token: Address, shares: bigint) =>
  rhWrite("recall", [token, shares]);
