"use client";

import { useState } from "react";
import { parseUnits } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import {
  HUB_VAULT,
  USDC,
  USDC_DECIMALS,
  TIER_INDEX,
  erc20Abi,
  vaultAbi,
} from "@/lib/contracts";
import type { Tier } from "@/lib/api";

export type DepositStep =
  | "idle"
  | "approving"
  | "depositing"
  | "done"
  | "error";

export function useDeposit() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [step, setStep] = useState<DepositStep>("idle");
  const [error, setError] = useState<string | null>(null);

  async function run(amountUsd: number, tier: Tier): Promise<boolean> {
    if (!address || !publicClient) {
      setError("Wallet not ready");
      setStep("error");
      return false;
    }
    setError(null);
    try {
      const amount = parseUnits(String(amountUsd), USDC_DECIMALS);

      const allowance = await publicClient.readContract({
        address: USDC,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, HUB_VAULT],
      });

      if (allowance < amount) {
        setStep("approving");
        const approveHash = await writeContractAsync({
          address: USDC,
          abi: erc20Abi,
          functionName: "approve",
          args: [HUB_VAULT, amount],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      setStep("depositing");
      const depositHash = await writeContractAsync({
        address: HUB_VAULT,
        abi: vaultAbi,
        functionName: "deposit",
        args: [amount, TIER_INDEX[tier]],
      });
      await publicClient.waitForTransactionReceipt({ hash: depositHash });

      setStep("done");
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.split("\n")[0]);
      setStep("error");
      return false;
    }
  }

  function reset() {
    setStep("idle");
    setError(null);
  }

  return { step, error, run, reset };
}