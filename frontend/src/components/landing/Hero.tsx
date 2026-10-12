import { ButtonLink } from "@/components/ui/ButtonLink";
import { GoalCalculator } from "./GoalCalculator";

export function Hero() {
  return (
    <section
      id="top"
      className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-14 px-6 pb-24 pt-14"
    >
      <div className="flex min-w-0 flex-1 basis-[440px] flex-col gap-7">
        <h1 className="font-display text-[clamp(48px,7vw,84px)] font-bold leading-[0.98] tracking-[-0.04em]">
          Set the goal. Nova does the rest.
        </h1>
        <p className="max-w-[500px] text-[21px] leading-[1.55] text-muted">
          Tell Nova what you&apos;re saving for. An AI agent spreads your
          deposits across crypto yield on Hyperliquid and stock-token lending on
          Robinhood Chain, then shows you every move it makes.
        </p>
        <div className="flex flex-wrap gap-3.5">
          <ButtonLink href="/app" size="lg">
            Start my plan
          </ButtonLink>
          <ButtonLink href="#how" variant="secondary" size="lg">
            See how it works
          </ButtonLink>
        </div>
      </div>

      <div className="min-w-0 flex-1 basis-[520px]">
        <GoalCalculator />
      </div>
    </section>
  );
}