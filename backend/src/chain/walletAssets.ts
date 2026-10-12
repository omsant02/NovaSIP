import { createPublicClient, formatUnits, http, parseAbi } from "viem";
import { HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import {
  HUB,
  RH_VAULT,
  getHubPosition,
  getRhBalance,
  hubAbi,
  hyperEvm,
  rhAbi,
  robinhood,
} from "./vault.js";

const erc20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);

// Everything here is public data readable by address; no signatures needed.
export async function getWalletAssets(user: string) {
  const addr = user as `0x${string}`;
  const evm = createPublicClient({ chain: hyperEvm, transport: http(process.env.RPC_URL) });
  const rh = createPublicClient({ chain: robinhood, transport: http(process.env.RH_RPC_URL) });
  const info = new InfoClient({
    transport: new HttpTransport({ isTestnet: process.env.HL_TESTNET === "true" }),
  });

  const errors: string[] = [];
  const safe = async <T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      errors.push(`${label}: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`);
      return fallback;
    }
  };

  // Already deposited in our contracts
  const deposited = await safe(
    "hubPosition",
    async () => {
      const p = await getHubPosition(addr);
      return {
        hubPrincipalUsd: Number(p.hubPrincipal) / 1e6,
        robinhoodPrincipalUsd: Number(p.rhPrincipal) / 1e6,
        pendingYieldUsd: Number(p.pendingYield) / 1e6,
      };
    },
    null
  );

  // USDC sitting in the wallet on HyperEVM (ready to deposit into the hub)
  const hyperEvmUsdc = await safe(
    "hyperEvmUsdc",
    async () => {
      const usdc = (await evm.readContract({
        address: HUB,
        abi: hubAbi as any,
        functionName: "asset",
      })) as `0x${string}`;
      const [bal, dec] = await Promise.all([
        evm.readContract({ address: usdc, abi: erc20, functionName: "balanceOf", args: [addr] }),
        evm.readContract({ address: usdc, abi: erc20, functionName: "decimals" }),
      ]);
      return Number(formatUnits(bal as bigint, Number(dec)));
    },
    null
  );

  // Stock tokens on Robinhood Chain: in the wallet, and already deposited in the vault
  const stockTokens = await safe(
    "robinhoodStockTokens",
    async () => {
      const tokens = (await rh.readContract({
        address: RH_VAULT,
        abi: rhAbi as any,
        functionName: "tokens",
      })) as `0x${string}`[];
      return Promise.all(
        tokens.map(async (token) => {
          const [symbol, dec, wallet, inVault] = await Promise.all([
            rh.readContract({ address: token, abi: erc20, functionName: "symbol" }),
            rh.readContract({ address: token, abi: erc20, functionName: "decimals" }),
            rh.readContract({ address: token, abi: erc20, functionName: "balanceOf", args: [addr] }),
            getRhBalance(addr, token),
          ]);
          const d = Number(dec);
          return {
            symbol: symbol as string,
            token,
            inWallet: Number(formatUnits(wallet as bigint, d)),
            depositedInVault: Number(formatUnits(inVault as bigint, d)),
          };
        })
      );
    },
    [] as { symbol: string; token: string; inWallet: number; depositedInVault: number }[]
  );

  // HyperCore spot balances (USDC and other tokens)
  const hypercoreSpot = await safe(
    "hypercoreSpot",
    async () => {
      const s = await info.spotClearinghouseState({ user: addr });
      return s.balances
        .filter((b) => Number(b.total) > 0)
        .map((b) => ({ coin: b.coin, total: b.total }));
    },
    [] as { coin: string; total: string }[]
  );

  return {
    user,
    deposited,
    hyperEvmUsdc,
    stockTokens,
    hypercoreSpot,
    note: "Stock-token amounts are in token units; no USD price source yet.",
    errors,
  };
}