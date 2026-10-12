"use client";

import { useAccount } from "wagmi";
import { useNovaState } from "@/lib/useNovaState";
import { fromUsdc } from "@/lib/api";
import { AllocationCard } from "@/components/app/AllocationCard";
import { ConnectButton } from "@/components/app/ConnectButton";
import { EmptyState } from "@/components/app/EmptyState";

export function Dashboard() {
  const { isConnected, status } = useAccount();
  const { data, error, isLoading } = useNovaState();

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

  if (total === 0) {
    return (
      <EmptyState
        title="Make your first deposit"
        body="Pick a goal and a risk level, deposit test USDC, and Nova starts working."
      >
        <button
          disabled
          className="rounded-full bg-gold px-6 py-3 font-medium text-gold-ink opacity-60"
        >
          Deposit (coming next)
        </button>
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-6">
      <AllocationCard allocation={data.book.allocation} total={total} />
    </div>
  );
}