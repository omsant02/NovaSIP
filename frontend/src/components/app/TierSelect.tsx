import type { Tier } from "@/lib/api";

const OPTIONS: { id: Tier; label: string; hint: string }[] = [
  { id: "conservative", label: "Conservative", hint: "Mostly lending, low risk" },
  { id: "balanced", label: "Balanced", hint: "A mix of everything" },
  { id: "aggressive", label: "Aggressive", hint: "More trading, more swings" },
];

export function TierSelect({
  value,
  onChange,
}: {
  value: Tier;
  onChange: (t: Tier) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Risk level">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-xl border p-3 text-left transition-colors ${
            value === o.id
              ? "border-gold bg-deep"
              : "border-line hover:border-line-strong"
          }`}
        >
          <span className="block text-sm font-medium">{o.label}</span>
          <span className="mt-1 block text-xs text-muted">{o.hint}</span>
        </button>
      ))}
    </div>
  );
}