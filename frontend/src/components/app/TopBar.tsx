import { Logo } from "@/components/brand/Logo";
import { ConnectButton } from "@/components/app/ConnectButton";

export function TopBar() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-6 py-4">
        <Logo />
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs text-muted sm:flex">
            <span className="h-2 w-2 rounded-full bg-mint" />
            HyperEVM testnet
          </span>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}