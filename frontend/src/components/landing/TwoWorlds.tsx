import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ChainCard } from "./ChainCard";

export function TwoWorlds() {
  return (
    <Section id="worlds" tone="deep" className="flex flex-col gap-14">
      <SectionHeading
        title="When crypto bleeds, your stocks don't."
        body="Nova invests across both markets, in one plan."
      />
      <div className="flex flex-wrap gap-6">
        <ChainCard
          name="Hyperliquid"
          dotClass="bg-mint"
          tone="mint"
          description="Crypto yield that earns in rising and falling markets."
          tags={["Delta-neutral carry", "USDC lending", "HLP vault"]}
        />
        <ChainCard
          name="Robinhood Chain"
          dotClass="bg-periwinkle"
          tone="periwinkle"
          description="Your stock tokens, working while they wait."
          tags={["TSLA", "AMZN", "AMD", "NFLX", "PLTR"]}
        />
      </div>
    </Section>
  );
}