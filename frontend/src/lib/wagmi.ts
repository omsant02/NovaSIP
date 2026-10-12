import { createConfig, http, injected } from "wagmi";
import { hyperEvmTestnet } from "@/lib/chains";

export const wagmiConfig = createConfig({
  chains: [hyperEvmTestnet],
  connectors: [injected()],
  transports: { [hyperEvmTestnet.id]: http() },
  ssr: true,
});