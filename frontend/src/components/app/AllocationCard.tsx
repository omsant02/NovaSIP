import type { Allocation } from "@/lib/api";
import {
  STRATEGY_ORDER,
  STRATEGY_COLOR,
  STRATEGY_LABEL,
  STRATEGY_LIVE,
  money,
} from "@/lib/allocation";
import { Donut } from "@/components/app/Donut";

export function AllocationCard({
  allocation,
  total,
}: {
  allocation: Allocation;
  total: number;
}) {
  const invested = STRATEGY_ORDER.reduce((s, k) => s + allocation[k], 0);
  const cashPct = Math.max(0, 100 - invested);

  return (
    <section className="rounded-2xl border border-line bg-field p-6">
      <h2 className="font-display text-xl font-semibold">Where your money is</h2>
      <div className="mt-6 grid items-center gap-8 md:grid-cols-[240px_1fr]">
        <Donut allocation={allocation} total={total} />
        <ul className="divide-y divide-line">
          {STRATEGY_ORDER.map((key) => (
            <li key={key} className="flex items-center gap-3 py-3">
              <span
                className="h-3 w-3 shrink-0 rounded-sm"
                style={{ background: STRATEGY_COLOR[key] }}
              />
              <span className="flex-1">{STRATEGY_LABEL[key]}</span>
              <span
                className={`rounded-full border px-2 py-0.5 text-xs ${
                  STRATEGY_LIVE[key]
                    ? "border-mint/40 text-mint"
                    : "border-periwinkle/40 text-periwinkle"
                }`}
              >
                {STRATEGY_LIVE[key] ? "Live on testnet" : "Preview"}
              </span>
              <span className="w-12 text-right tabular-nums">
                {allocation[key]}%
              </span>
              <span className="w-24 text-right tabular-nums text-muted">
                {money((allocation[key] / 100) * total)}
              </span>
            </li>
          ))}
          {cashPct > 0 && (
            <li className="flex items-center gap-3 py-3 text-muted">
              <span className="h-3 w-3 shrink-0 rounded-sm bg-line-strong" />
              <span className="flex-1">Cash</span>
              <span className="w-12 text-right tabular-nums">{cashPct}%</span>
              <span className="w-24 text-right tabular-nums">
                {money((cashPct / 100) * total)}
              </span>
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}