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
export const RH_USDG = need("RH_USDG") as Address;
export const RH_MORPHO = need("RH_MORPHO") as Address;
export const RH_EXCHANGE = need("RH_EXCHANGE") as Address;

export const account = privateKeyToAccount(need("PRIVATE_KEY") as `0x${string}`);

export const hubPublic = createPublicClient({ chain: hyperEvm, transport: http() });
export const rhPublic = createPublicClient({ chain: robinhood, transport: http() });
const hubWallet = createWalletClient({
  account,
  chain: hyperEvm,
  transport: http(),
});
export const rhWalletClient = createWalletClient({
  account,
  chain: robinhood,
  transport: http(),
});

// ---------- Hub reads ----------

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

// ---------- Robinhood vault reads ----------

export async function getRhTokens(): Promise<Address[]> {
  return (await rhPublic.readContract({
    address: RH_VAULT,
    abi: rhAbi,
    functionName: "tokens",
  })) as Address[];
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

export async function getRhTotalBalance(token: Address): Promise<bigint> {
  return (await rhPublic.readContract({
    address: RH_VAULT,
    abi: rhAbi,
    functionName: "totalBalance",
    args: [token],
  })) as bigint;
}

export async function getRhRotation(token: Address) {
  const r = (await rhPublic.readContract({
    address: RH_VAULT,
    abi: rhAbi,
    functionName: "rotation",
    args: [token],
  })) as readonly [bigint, bigint, bigint, bigint];
  return {
    stockRotated: r[0],
    usdgIdle: r[1],
    parkedShares: r[2],
    parkedAssets: r[3],
  };
}

export async function getRhSurplus(token: Address): Promise<bigint> {
  return (await rhPublic.readContract({
    address: RH_VAULT,
    abi: rhAbi,
    functionName: "surplus",
    args: [token],
  })) as bigint;
}

export async function getRhYieldOwed(
  user: Address,
  token: Address,
): Promise<bigint> {
  return (await rhPublic.readContract({
    address: RH_VAULT,
    abi: rhAbi,
    functionName: "yieldOwed",
    args: [user, token],
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
  const hash = await rhWalletClient.writeContract({
    address: RH_VAULT,
    abi: rhAbi,
    functionName,
    args,
  });
  const receipt = await rhPublic.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted (${hash})`);
  return { hash, status: receipt.status };
}

// Hub wrappers
export const deployToCore = (amount6: bigint) =>
  hubWrite("deployToCore", [amount6]);
export const acknowledgeCoreReturn = (amount6: bigint) =>
  hubWrite("acknowledgeCoreReturn", [amount6]);
export const recordRHDeposit = (user: Address, usd6: bigint, tier: number) =>
  hubWrite("recordRHDeposit", [user, usd6, tier]);
export const recordRHWithdrawal = (user: Address, usd6: bigint) =>
  hubWrite("recordRHWithdrawal", [user, usd6]);

// Robinhood vault rotation wrappers
export const rhSellToUsdg = (token: Address, amount: bigint, minUsdgOut: bigint) =>
  rhWrite("sellToUsdg", [token, amount, minUsdgOut]);
export const rhParkUsdg = (token: Address, amount: bigint) =>
  rhWrite("parkUsdg", [token, amount]);
export const rhUnparkUsdg = (token: Address, shares: bigint) =>
  rhWrite("unparkUsdg", [token, shares]);
export const rhBuyBackStock = (token: Address, usdgAmount: bigint, stockToRestore: bigint) =>
  rhWrite("buyBackStock", [token, usdgAmount, stockToRestore]);
export const rhRecognizeYield = (token: Address, amount: bigint) =>
  rhWrite("recognizeYield", [token, amount]);
export const rhCreditYield = (user: Address, token: Address, amount: bigint) =>
  rhWrite("creditYield", [user, token, amount]);