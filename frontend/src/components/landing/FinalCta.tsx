import { Section } from "@/components/ui/Section";
import { ButtonLink } from "@/components/ui/ButtonLink";

export function FinalCta() {
  return (
    <Section tone="deep">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-display text-4xl font-semibold tracking-tight md:text-5xl">
          Your first star takes one deposit.
        </h2>
        <p className="mt-4 text-muted">
          Testnet only for now. Connect a wallet, pick a goal, and watch Nova work.
        </p>
        <div className="mt-8 flex justify-center">
          <ButtonLink href="/app" size="lg">Launch app</ButtonLink>
        </div>
      </div>
    </Section>
  );
}