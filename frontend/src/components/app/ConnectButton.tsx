"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { hyperEvmTestnet } from "@/lib/chains";

const btn =
  "rounded-full px-4 py-2 text-sm font-medium transition-colors";

export function ConnectButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();

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

  if (chainId !== hyperEvmTestnet.id) {
    return (
      <button
        className={`${btn} bg-clay text-gold-ink hover:opacity-90`}
        disabled={switching}
        onClick={() => switchChain({ chainId: hyperEvmTestnet.id })}
      >
        {switching ? "Switching..." : "Switch to HyperEVM"}
      </button>
    );
  }

  return (
    <button
      className={`${btn} border border-line-strong text-starlight hover:bg-field`}
      onClick={() => disconnect()}
      title="Disconnect"
    >
      {address?.slice(0, 6)}...{address?.slice(-4)}
    </button>
  );
}