import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ChainCard } from "./ChainCard";

export function TwoWorlds() {
  return (
    <Section tone="deep" className="flex flex-col gap-14">
      <SectionHeading
        title="When crypto bleeds, your NVDA doesn't."
        body="Most yield apps live on one side of the market. Nova works both: crypto yield on Hyperliquid and stock-token lending on Robinhood Chain. Different assets, different moods, one plan."
      />
      <div className="flex flex-wrap gap-6">
        <ChainCard
          name="Hyperliquid"
          dotClass="bg-mint"
          tone="mint"
          description="Market-neutral carry, USDC lending and the HLP vault. Built to earn whether prices rise or fall."
          tags={["ETH carry", "USDC lending", "HLP vault", "Range signals"]}
        />
        <ChainCard
          name="Robinhood Chain"
          dotClass="bg-periwinkle"
          tone="periwinkle"
          description="Put the stock tokens you already hold to work. They stay on Robinhood Chain and earn lending yield."
          tags={["TSLA", "AMZN", "NFLX", "AMD", "PLTR"]}
        />
      </div>
    </Section>
  );
}