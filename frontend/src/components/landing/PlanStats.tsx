import { usd } from "@/lib/format";
import type { PlanResult } from "@/lib/plan";

type Props = {
  plan: PlanResult;
  tierLabel: string;
};

function Stat({
  label,
  value,
  note,
  accent = false,
}: {
  label: string;
  value: string;
  note?: string;
  accent?: boolean;
}) {
  return (
    <div className="min-w-[110px] flex-1">
      <div className="text-[15px] text-muted">{label}</div>
      <div
        className={`font-display text-[32px] font-bold tracking-[-0.03em] ${
          accent ? "text-gold" : ""
        }`}
      >
        ${value}
      </div>
      {note && <div className="text-sm text-dim">{note}</div>}
    </div>
  );
}

export function PlanStats({ plan, tierLabel }: Props) {
  return (
    <>
      <div className="flex flex-wrap gap-6">
        <Stat label="Monthly deposit" value={usd(plan.pmt)} accent />
        <Stat label="You put in" value={usd(plan.deposited)} />
        <Stat
          label="Nova aims to add"
          value={usd(plan.earned)}
          note={`${plan.apy}% a year on a growing balance`}
        />
      </div>
      <p className="text-sm text-dim">
        {tierLabel} illustration at {plan.apy}% a year (range {plan.low}–
        {plan.high}%). Variable, not a promise.
      </p>
    </>
  );
}