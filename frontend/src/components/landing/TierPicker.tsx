"use client";

import { PLANS, type Tier } from "@/lib/plan";

type Props = {
  value: Tier;
  onChange: (tier: Tier) => void;
};

export function TierPicker({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-3 gap-2.5" role="group" aria-label="Plan">
      {(Object.keys(PLANS) as Tier[]).map((tier) => {
        const on = tier === value;
        const { label, low, high } = PLANS[tier];
        return (
          <button
            key={tier}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(tier)}
            className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
              on
                ? "border-gold bg-gold text-gold-ink"
                : "border-line-strong text-starlight hover:border-muted"
            }`}
          >
            <span className="block text-base font-semibold">{label}</span>
            <span
              className={`block text-sm ${on ? "text-gold-ink/70" : "text-dim"}`}
            >
              {low}–{high}% a year
            </span>
          </button>
        );
      })}
    </div>
  );
}