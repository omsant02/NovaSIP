import { Logo } from "@/components/brand/Logo";

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-6 py-10 md:flex-row md:items-center md:justify-between">
        <Logo />
        <p className="max-w-md text-sm text-dim">
          Hackathon prototype on testnet. Projections are illustrative, not
          promises. Not financial advice.
        </p>
        <a
          href="https://github.com/omsant02/NovaSIP"
          className="text-sm text-muted hover:text-starlight"
        >
          Open source on GitHub
        </a>
      </div>
    </footer>
  );
}