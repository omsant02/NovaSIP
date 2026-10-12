import { usd } from "@/lib/format";
import type { PlanResult } from "@/lib/plan";

type Props = {
  plan: PlanResult;
  tierLabel: string;
};

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="min-w-[140px] flex-1">
      <div className="text-[15px] text-muted">{label}</div>
      <div
        className={`font-display text-[40px] font-bold tracking-[-0.03em] ${
          accent ? "text-gold" : ""
        }`}
      >
        ${value}
      </div>
    </div>
  );
}

export function PlanStats({ plan, tierLabel }: Props) {
  return (
    <>
      <div className="flex flex-wrap gap-6">
        <Stat label="Monthly deposit" value={usd(plan.pmt)} accent />
        <Stat label="You put in" value={usd(plan.deposited)} />
        <Stat label="Nova aims to add" value={usd(plan.earned)} />
      </div>
      <p className="text-sm leading-relaxed text-dim">
        Illustration at {plan.apy}% a year for the {tierLabel} plan. Returns vary
        and can be lower. This is a projection, not a promise.
      </p>
    </>
  );
}