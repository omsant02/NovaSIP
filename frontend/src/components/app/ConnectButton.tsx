"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { ChainSwitcher } from "@/components/app/ChainSwitcher";

const btn = "rounded-full px-4 py-2 text-sm font-medium transition-colors";

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (!isConnected) {
    return (
      <button
        className={`${btn} bg-gold text-gold-ink hover:opacity-90`}
        disabled={isPending}
        onClick={() => connect({ connector: connectors[0] })}
      >
        {isPending ? "Connecting..." : "Connect wallet"}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <ChainSwitcher />
      <span className="rounded-full border border-line px-3 py-2 font-mono text-xs text-starlight">
        {address?.slice(0, 6)}...{address?.slice(-4)}
      </span>
      <button
        className={`${btn} border border-line-strong text-muted hover:bg-field hover:text-starlight`}
        onClick={() => disconnect()}
      >
        Disconnect
      </button>
    </div>
  );
}