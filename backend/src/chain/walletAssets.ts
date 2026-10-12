import { formatUnits, parseAbi } from "viem";
import {
  HUB,
  getHubPosition,
  getRhBalance,
  hubAbi,
  hubPublic,
  rhPublic,
} from "./vault.js";
import { getAllTokenMeta } from "./robinhood.js";
import { getStockQuotes } from "./prices.js";

const erc20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

const round2 = (n: number) => Math.round(n * 100) / 100;

// Everything here is public data readable by address; no signatures needed.
export async function getWalletAssets(user: string) {
  const addr = user as `0x${string}`;

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
    null,
  );

  // USDC sitting in the wallet on HyperEVM (ready to deposit into the hub)
  const hyperEvmUsdc = await safe(
    "hyperEvmUsdc",
    async () => {
      const usdc = (await hubPublic.readContract({
        address: HUB,
        abi: hubAbi as any,
        functionName: "asset",
      })) as `0x${string}`;
      const [bal, dec] = await Promise.all([
        hubPublic.readContract({ address: usdc, abi: erc20, functionName: "balanceOf", args: [addr] }),
        hubPublic.readContract({ address: usdc, abi: erc20, functionName: "decimals" }),
      ]);
      return Number(formatUnits(bal as bigint, Number(dec)));
    },
    null,
  );

  // Stock tokens on Robinhood Chain: in the wallet, and already deposited in the vault, at live prices
  const stockTokens = await safe(
    "robinhoodStockTokens",
    async () => {
      const metas = await getAllTokenMeta();
      const quotes = await getStockQuotes(metas.map((m) => m.symbol));
      return Promise.all(
        metas.map(async (m) => {
          const [wallet, inVault] = await Promise.all([
            rhPublic.readContract({ address: m.token, abi: erc20, functionName: "balanceOf", args: [addr] }),
            getRhBalance(addr, m.token),
          ]);
          const price = quotes[m.symbol.toUpperCase()]?.price ?? null;
          const inWallet = Number(formatUnits(wallet as bigint, m.decimals));
          const depositedInVault = Number(formatUnits(inVault, m.decimals));
          return {
            symbol: m.symbol,
            token: m.token as string,
            inWallet,
            depositedInVault,
            priceUsd: price,
            walletUsd: price !== null ? round2(inWallet * price) : null,
            depositedUsd: price !== null ? round2(depositedInVault * price) : null,
          };
        }),
      );
    },
    [] as {
      symbol: string;
      token: string;
      inWallet: number;
      depositedInVault: number;
      priceUsd: number | null;
      walletUsd: number | null;
      depositedUsd: number | null;
    }[],
  );

  return {
    user,
    deposited,
    hyperEvmUsdc,
    stockTokens,
    note: "hyperEvmUsdc is USDC on HyperEVM; stockTokens are on Robinhood Chain, valued at live prices.",
    errors,
  };
}