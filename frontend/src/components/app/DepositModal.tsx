"use client";

import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { saveProfile, type Tier } from "@/lib/api";
import { USDC, USDC_DECIMALS, erc20Abi } from "@/lib/contracts";
import { useDeposit } from "@/lib/useDeposit";
import { TierSelect } from "@/components/app/TierSelect";

const field =
  "mt-1 w-full rounded-lg border border-line bg-deep px-3 py-2 text-starlight outline-none focus:border-gold";

export function DepositModal({ onClose }: { onClose: () => void }) {
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const { step, error, run } = useDeposit();

  const [goalName, setGoalName] = useState("My goal");
  const [tier, setTier] = useState<Tier>("balanced");
  const [targetText, setTargetText] = useState("1000");
  const [goalMonth, setGoalMonth] = useState("");
  const [amountText, setAmountText] = useState("10");
  const targetUsd = Number(targetText) || 0;
  const amount = Number(amountText) || 0;

  const { data: balance } = useReadContract({
    address: USDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });
  const balanceUsd =
    balance !== undefined ? Number(formatUnits(balance, USDC_DECIMALS)) : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (step === "done") {
      queryClient.invalidateQueries({ queryKey: ["nova-state"] });
    }
  }, [step, queryClient]);

  const busy = step === "approving" || step === "depositing";
  const invalid = amount < 1 || (balanceUsd !== null && amount > balanceUsd);

  async function submit() {
    if (!address) return;
    try {
      await saveProfile(address, {
        goalName,
        targetUsd,
        goalDate: goalMonth ? `${goalMonth}-01` : (null as unknown as string),
        tier,
      });
    } catch {
      // goal save is best-effort; the deposit is what matters
    }
    await run(amount, tier);
  }

  const label =
    step === "approving"
      ? "Approve USDC in your wallet..."
      : step === "depositing"
        ? "Confirm the deposit in your wallet..."
        : "Deposit";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-midnight/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Make a deposit"
    >
      <div className="w-full max-w-lg rounded-2xl border border-line bg-field p-6">
        {step === "done" ? (
          <div className="text-center">
            <h2 className="font-display text-2xl font-semibold">You're in.</h2>
            <p className="mt-3 text-muted">
              Your deposit is confirmed. Nova will deploy it on the next run.
            </p>
            <button
              onClick={onClose}
              className="mt-6 rounded-full bg-gold px-6 py-2.5 font-medium text-gold-ink"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between">
              <h2 className="font-display text-2xl font-semibold">
                Set your goal
              </h2>
              <button
                onClick={onClose}
                disabled={busy}
                className="text-muted hover:text-starlight"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <label className="block text-sm text-muted">
                What are you saving for?
                <input
                  className={field}
                  value={goalName}
                  onChange={(e) => setGoalName(e.target.value)}
                />
              </label>

              <div className="grid grid-cols-2 gap-4">
                <label className="block text-sm text-muted">
                  Target (USD)
                  <input
                    className={field}
                    type="number"
                    min={1}
                    value={targetText}
                    onChange={(e) => setTargetText(e.target.value)}
                  />
                </label>
                <label className="block text-sm text-muted">
                  By when
                  <input
                    className={field}
                    type="month"
                    value={goalMonth}
                    onChange={(e) => setGoalMonth(e.target.value)}
                  />
                </label>
              </div>

              <div>
                <span className="text-sm text-muted">Risk level</span>
                <div className="mt-1">
                  <TierSelect value={tier} onChange={setTier} />
                </div>
              </div>

              <label className="block text-sm text-muted">
                Deposit amount (test USDC)
                <input
                  className={field}
                  type="number"
                  min={1}
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value)}
                />
                <span className="mt-1 block text-xs text-dim">
                  {balanceUsd !== null
                    ? `Wallet balance: ${balanceUsd.toFixed(2)} USDC`
                    : "Reading balance..."}
                </span>
              </label>
            </div>

            {step === "error" && error && (
              <p className="mt-4 text-sm text-danger">{error}</p>
            )}

            <button
              onClick={submit}
              disabled={busy || invalid}
              className="mt-6 w-full rounded-full bg-gold px-6 py-3 font-medium text-gold-ink disabled:opacity-50"
            >
              {step === "error" ? "Try again" : label}
            </button>
            <p className="mt-3 text-center text-xs text-dim">
              Testnet only. Two wallet confirmations: approve, then deposit.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
