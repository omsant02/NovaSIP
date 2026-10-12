import { Logo } from "@/components/brand/Logo";
import { ConnectButton } from "@/components/app/ConnectButton";

export function TopBar() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-6 py-4">
        <Logo />
        <ConnectButton />
      </div>
    </header>
  );
}