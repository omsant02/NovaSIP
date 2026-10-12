import { Logo } from "@/components/brand/Logo";
import { ButtonLink } from "@/components/ui/ButtonLink";

export function Nav() {
  return (
    <header className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-6 py-7">
      <Logo />
      <nav className="flex flex-wrap items-center gap-8 text-base text-muted">
        <a href="#decisions" className="hover:text-starlight">
          How Nova decides
        </a>
        <a href="#limits" className="hover:text-starlight">
          Limits
        </a>
        <ButtonLink href="/app">Launch app</ButtonLink>
      </nav>
    </header>
  );
}