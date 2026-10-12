"use client";

import { useAccount, useSwitchChain } from "wagmi";
import { hyperEvmTestnet, robinhoodTestnet } from "@/lib/chains";

const CHAINS = [
  { chain: hyperEvmTestnet, label: "HyperEVM" },
  { chain: robinhoodTestnet, label: "Robinhood" },
];

export function ChainSwitcher() {
  const { chainId } = useAccount();
  const { switchChain, isPending, variables } = useSwitchChain();

  return (
    <div className="flex items-center rounded-full border border-line p-0.5 text-xs">
      {CHAINS.map(({ chain, label }) => {
        const active = chainId === chain.id;
        const switching = isPending && variables?.chainId === chain.id;
        return (
          <button
            key={chain.id}
            disabled={active || isPending}
            onClick={() => switchChain({ chainId: chain.id })}
            className={`flex items-center gap-2 rounded-full px-3 py-1.5 transition-colors ${
              active
                ? "bg-field text-starlight"
                : "text-muted hover:text-starlight"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                active ? "bg-mint" : "bg-line-strong"
              }`}
            />
            {switching ? "Switching..." : label}
          </button>
        );
      })}
    </div>
  );
}