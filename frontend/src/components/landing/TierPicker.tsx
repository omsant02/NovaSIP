"use client";

import { PLANS, type Tier } from "@/lib/plan";

type Props = {
  value: Tier;
  onChange: (tier: Tier) => void;
};

export function TierPicker({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2.5" role="group" aria-label="Plan">
      {(Object.keys(PLANS) as Tier[]).map((tier) => {
        const on = tier === value;
        return (
          <button
            key={tier}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(tier)}
            className={`h-[42px] rounded-xl border px-[18px] text-base font-semibold transition-colors ${
              on
                ? "border-gold bg-gold text-gold-ink"
                : "border-line-strong text-starlight hover:border-muted"
            }`}
          >
            {PLANS[tier].label}
          </button>
        );
      })}
    </div>
  );
}