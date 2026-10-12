import { Section } from "@/components/ui/Section";
import { ButtonLink } from "@/components/ui/ButtonLink";

export function FinalCta() {
  return (
    <Section>
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-display text-[clamp(40px,5vw,60px)] font-bold leading-[1.02] tracking-[-0.04em]">
          Set your first goal.
        </h2>
        <p className="mt-5 text-xl text-muted">
          Testnet only. Connect a wallet and watch Nova work.
        </p>
        <div className="mt-9 flex justify-center">
          <ButtonLink href="/app" size="lg">
            Launch app
          </ButtonLink>
        </div>
      </div>
    </Section>
  );
}