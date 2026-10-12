"use client";

import { useState } from "react";
import { parseUnits } from "viem";
import {
  useAccount,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { hyperEvmTestnet, robinhoodTestnet } from "@/lib/chains";
import {
  HUB_VAULT,
  RH_VAULT,
  STOCK_DECIMALS,
  STOCK_TOKENS,
  TIER_INDEX,
  USDC,
  USDC_DECIMALS,
  erc20Abi,
  rhVaultAbi,
  vaultAbi,
  type StockSymbol,
} from "@/lib/contracts";
import type { Tier } from "@/lib/api";

export type DepositStep =
  | "idle"
  | "switching"
  | "approving"
  | "depositing"
  | "done"
  | "error";

type ChainId = typeof hyperEvmTestnet.id | typeof robinhoodTestnet.id;

export function useDeposit() {
  const { address, chainId } = useAccount();
  const hubClient = usePublicClient({ chainId: hyperEvmTestnet.id });
  const rhClient = usePublicClient({ chainId: robinhoodTestnet.id });
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [step, setStep] = useState<DepositStep>("idle");
  const [error, setError] = useState<string | null>(null);

  async function ensureChain(id: ChainId) {
    if (chainId === id) return;
    setStep("switching");
    await switchChainAsync({ chainId: id });
  }

  async function guard(fn: () => Promise<void>): Promise<boolean> {
    if (!address) {
      setError("Wallet not ready");
      setStep("error");
      return false;
    }
    setError(null);
    try {
      await fn();
      setStep("done");
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.split("\n")[0]);
      setStep("error");
      return false;
    }
  }

  /** USDC into the Hyperliquid-side hub vault. */
  function run(amountUsd: number, tier: Tier): Promise<boolean> {
    return guard(async () => {
      if (!hubClient || !address) throw new Error("Wallet not ready");
      await ensureChain(hyperEvmTestnet.id);
      const amount = parseUnits(
        amountUsd.toFixed(USDC_DECIMALS),
        USDC_DECIMALS,
      );

      const allowance = await hubClient.readContract({
        address: USDC,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, HUB_VAULT],
      });
      if (allowance < amount) {
        setStep("approving");
        const hash = await writeContractAsync({
          chainId: hyperEvmTestnet.id,
          address: USDC,
          abi: erc20Abi,
          functionName: "approve",
          args: [HUB_VAULT, amount],
        });
        await hubClient.waitForTransactionReceipt({ hash });
      }

      setStep("depositing");
      const hash = await writeContractAsync({
        chainId: hyperEvmTestnet.id,
        address: HUB_VAULT,
        abi: vaultAbi,
        functionName: "deposit",
        args: [amount, TIER_INDEX[tier]],
      });
      await hubClient.waitForTransactionReceipt({ hash });
    });
  }

  /** Stock tokens into the Robinhood Chain vault. */
  function runStock(
    symbol: StockSymbol,
    units: number,
    tier: Tier,
  ): Promise<boolean> {
    return guard(async () => {
      if (!rhClient || !address) throw new Error("Wallet not ready");
      await ensureChain(robinhoodTestnet.id);
      const token = STOCK_TOKENS[symbol];
      const amount = parseUnits(units.toFixed(6), STOCK_DECIMALS);

      const allowance = await rhClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, RH_VAULT],
      });
      if (allowance < amount) {
        setStep("approving");
        const hash = await writeContractAsync({
          chainId: robinhoodTestnet.id,
          address: token,
          abi: erc20Abi,
          functionName: "approve",
          args: [RH_VAULT, amount],
        });
        await rhClient.waitForTransactionReceipt({ hash });
      }

      setStep("depositing");
      const hash = await writeContractAsync({
        chainId: robinhoodTestnet.id,
        address: RH_VAULT,
        abi: rhVaultAbi,
        functionName: "deposit",
        args: [token, amount, TIER_INDEX[tier]],
      });
      await rhClient.waitForTransactionReceipt({ hash });
    });
  }

  /** Claim the yield the vault has credited for one stock token. */
  function claim(symbol: StockSymbol): Promise<boolean> {
    return guard(async () => {
      if (!rhClient) throw new Error("Wallet not ready");
      await ensureChain(robinhoodTestnet.id);
      setStep("depositing");
      const hash = await writeContractAsync({
        chainId: robinhoodTestnet.id,
        address: RH_VAULT,
        abi: rhVaultAbi,
        functionName: "claimYield",
        args: [STOCK_TOKENS[symbol]],
      });
      await rhClient.waitForTransactionReceipt({ hash });
    });
  }

  /** Take USDC back out of the hub vault (an early-exit fee applies before the goal date). */
  function withdrawUsdc(amountUsd: number): Promise<boolean> {
    return guard(async () => {
      if (!hubClient) throw new Error("Wallet not ready");
      await ensureChain(hyperEvmTestnet.id);
      setStep("depositing");
      const amount = Math.floor(amountUsd * 1e6) / 1e6;
      const hash = await writeContractAsync({
        chainId: hyperEvmTestnet.id,
        address: HUB_VAULT,
        abi: vaultAbi,
        functionName: "withdraw",
        args: [parseUnits(amount.toFixed(USDC_DECIMALS), USDC_DECIMALS)],
      });
      await hubClient.waitForTransactionReceipt({ hash });
    });
  }

  /** Exit the hub side completely: all principal plus credited yield, and cancel the plan. */
  function exitAll(): Promise<boolean> {
    return guard(async () => {
      if (!hubClient) throw new Error("Wallet not ready");
      await ensureChain(hyperEvmTestnet.id);
      setStep("depositing");
      const hash = await writeContractAsync({
        chainId: hyperEvmTestnet.id,
        address: HUB_VAULT,
        abi: vaultAbi,
        functionName: "exitAll",
      });
      await hubClient.waitForTransactionReceipt({ hash });
    });
  }

  /** Take stock tokens back out of the Robinhood vault. */
  function withdrawStock(symbol: StockSymbol, units: number): Promise<boolean> {
    return guard(async () => {
      if (!rhClient) throw new Error("Wallet not ready");
      await ensureChain(robinhoodTestnet.id);
      setStep("depositing");
      const amount = Math.floor(units * 1e6) / 1e6;
      const hash = await writeContractAsync({
        chainId: robinhoodTestnet.id,
        address: RH_VAULT,
        abi: rhVaultAbi,
        functionName: "withdraw",
        args: [
          STOCK_TOKENS[symbol],
          parseUnits(amount.toFixed(6), STOCK_DECIMALS),
        ],
      });
      await rhClient.waitForTransactionReceipt({ hash });
    });
  }

  function reset() {
    setStep("idle");
    setError(null);
  }

  return {
    step,
    error,
    run,
    runStock,
    claim,
    withdrawUsdc,
    exitAll,
    withdrawStock,
    reset,
  };
}
