"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useNovaState } from "@/lib/useNovaState";
import { fromUsdc } from "@/lib/api";
import { AllocationCard } from "@/components/app/AllocationCard";
import { ConnectButton } from "@/components/app/ConnectButton";
import { DepositModal } from "@/components/app/DepositModal";
import { EmptyState } from "@/components/app/EmptyState";

export function Dashboard() {
  const { isConnected, status } = useAccount();
  const { data, error, isLoading } = useNovaState();
  const [depositOpen, setDepositOpen] = useState(false);

  if (status === "connecting" || status === "reconnecting") {
    return <p className="text-muted">Checking your wallet...</p>;
  }

  if (!isConnected) {
    return (
      <EmptyState
        title="Connect your wallet"
        body="Nova needs your wallet to show your goal, your money and what it has done for you."
      >
        <ConnectButton />
      </EmptyState>
    );
  }

  if (isLoading) {
    return <p className="text-muted">Loading your portfolio...</p>;
  }

  if (error || !data) {
    return (
      <p className="text-danger">
        Can't reach Nova's backend. Is the API running?
      </p>
    );
  }

  const total =
    fromUsdc(data.hub.hubPrincipal) + fromUsdc(data.hub.rhPrincipal);

  const modal = depositOpen && (
    <DepositModal onClose={() => setDepositOpen(false)} />
  );

  if (total === 0) {
    return (
      <>
        <EmptyState
          title="Make your first deposit"
          body="Pick a goal and a risk level, deposit test USDC, and Nova starts working."
        >
          <button
            onClick={() => setDepositOpen(true)}
            className="rounded-full bg-gold px-6 py-3 font-medium text-gold-ink hover:opacity-90"
          >
            Set a goal and deposit
          </button>
        </EmptyState>
        {modal}
      </>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="flex justify-end">
        <button
          onClick={() => setDepositOpen(true)}
          className="rounded-full border border-line-strong px-4 py-2 text-sm hover:bg-field"
        >
          Add money
        </button>
      </div>
      <AllocationCard allocation={data.book.allocation} total={total} />
      {modal}
    </div>
  );
}