"use client";

import { useAccount } from "wagmi";
import { useNovaState } from "@/lib/useNovaState";
import { usePerformance } from "@/lib/usePerformance";
import { useRobinhood } from "@/lib/useRobinhood";
import { estimatePnl } from "@/lib/pnl";
import { fromUsdc } from "@/lib/api";
import { AllocationCard } from "@/components/app/AllocationCard";
import { ConnectButton } from "@/components/app/ConnectButton";
import { EmptyState } from "@/components/app/EmptyState";
import { GoalCard } from "@/components/app/GoalCard";
import { RobinhoodCard } from "@/components/app/RobinhoodCard";
import { HubCard } from "@/components/app/HubCard";

export function Dashboard() {
  const { isConnected, status } = useAccount();
  const { data, error, isLoading } = useNovaState();
  const { data: perf } = usePerformance();
  const { data: rh, isLoading: rhLoading } = useRobinhood();

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

  if (isLoading || rhLoading) {
    return <p className="text-muted">Loading your portfolio...</p>;
  }

  if (error || !data) {
    return (
      <p className="text-danger">
        Can't reach Nova's backend. Is the API running?
      </p>
    );
  }

  // USDC on Hyperliquid's side plus the live dollar value of stock tokens.
  const total = fromUsdc(data.hub.hubPrincipal) + (rh?.totalUsd ?? 0);

  if (total === 0) {
    return (
      <EmptyState
        title="Let's set your first goal"
        body="Tell Nova what you're saving for in the chat. It will suggest a plan and send the deposit to your wallet."
      />
    );
  }

  // The stock slices come from live on-chain data, not the last saved run.
  const pct = (usd: number) => Math.round((usd / total) * 1000) / 10;
  const allocation =
    rh && rh.totalUsd > 0
      ? {
          ...data.book.allocation,
          stocks: pct(rh.heldUsd),
          robinhood: pct(rh.rotatedUsd),
        }
      : data.book.allocation;

  const pnl = estimatePnl(allocation, total, perf, rh);

  const hub = data.hub as unknown as {
    hubPrincipal: string;
    pendingYield?: string;
    goalDate?: string;
  };

  return (
    <div className="grid content-start gap-6">
      <GoalCard profile={data.profile} total={total} pnl={pnl.total} />
      <AllocationCard
        stockApy={perf?.stockYield.supplyApyPct ?? rh?.morphoApyPct}
        allocation={allocation}
        total={total}
        pnl={pnl.byStrategy}
      />
      {fromUsdc(hub.hubPrincipal) > 0 && (
        <HubCard
          principalUsd={fromUsdc(hub.hubPrincipal)}
          pendingYieldUsd={fromUsdc(hub.pendingYield ?? "0")}
          goalDateSec={Number(hub.goalDate ?? 0)}
        />
      )}
      {rh && rh.totalUsd > 0 && <RobinhoodCard status={rh} />}
    </div>
  );
}
