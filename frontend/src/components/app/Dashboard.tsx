"use client";

import { useAccount } from "wagmi";
import { useNovaState } from "@/lib/useNovaState";
import { usePerformance } from "@/lib/usePerformance";
import { estimatePnl } from "@/lib/pnl";
import { fromUsdc } from "@/lib/api";
import { AllocationCard } from "@/components/app/AllocationCard";
import { ConnectButton } from "@/components/app/ConnectButton";
import { EmptyState } from "@/components/app/EmptyState";
import { GoalCard } from "@/components/app/GoalCard";

export function Dashboard() {
  const { isConnected, status } = useAccount();
  const { data, error, isLoading } = useNovaState();
  const { data: perf } = usePerformance();

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
        title="Let's set your first goal"
        body="Tell Nova what you're saving for in the chat. It will suggest a plan and send the deposit to your wallet."
      />
    );
  }

  const pnl = estimatePnl(data.book.allocation, total, perf);

  return (
    <div className="grid content-start gap-6">
      <GoalCard profile={data.profile} total={total} pnl={pnl.total} />
      <AllocationCard
        allocation={data.book.allocation}
        total={total}
        pnl={pnl.byStrategy}
      />
    </div>
  );
}