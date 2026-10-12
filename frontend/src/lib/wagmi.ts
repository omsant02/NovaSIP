import { createConfig, http, injected } from "wagmi";
import { hyperEvmTestnet, robinhoodTestnet } from "@/lib/chains";

export const wagmiConfig = createConfig({
  chains: [hyperEvmTestnet, robinhoodTestnet],
  connectors: [injected()],
  transports: {
    [hyperEvmTestnet.id]: http(),
    [robinhoodTestnet.id]: http(),
  },
  ssr: true,
});