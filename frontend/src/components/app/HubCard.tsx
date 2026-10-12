"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { money } from "@/lib/allocation";
import { useDeposit } from "@/lib/useDeposit";

export function HubCard({
  principalUsd,
  pendingYieldUsd,
  goalDateSec,
}: {
  principalUsd: number;
  pendingYieldUsd: number;
  goalDateSec: number;
}) {
  const queryClient = useQueryClient();
  const { exitAll, error, reset } = useDeposit();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const early = goalDateSec * 1000 > Date.now();

  const onExit = async () => {
    setBusy(true);
    reset();
    setNote("Confirm the withdrawal in your wallet...");
    const ok = await exitAll();
    setNote(ok ? "Your USDC is back in your wallet." : null);
    setBusy(false);
    queryClient.invalidateQueries({ queryKey: ["nova-state"] });
  };

  return (
    <section className="rounded-2xl border border-line bg-field p-6">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="font-display text-xl font-semibold">
          USDC on Hyperliquid
        </h2>
        <span className="ml-auto tabular-nums">{money(principalUsd)}</span>
      </div>
      <p className="mt-2 text-sm text-muted">
        {money(pendingYieldUsd)} of yield is building up. Withdrawing returns
        your USDC and any credited yield, and stops your monthly plan.
        {early && " Leaving before your goal date charges an early-exit fee."}
      </p>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={onExit}
          className="rounded-full border border-line-strong px-4 py-1.5 text-sm text-muted hover:bg-field hover:text-starlight disabled:opacity-50"
        >
          {busy ? "Withdrawing..." : "Withdraw all"}
        </button>
        {(error ?? note) && (
          <span className="text-sm text-muted">{error ?? note}</span>
        )}
      </div>
    </section>
  );
}