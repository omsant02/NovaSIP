import type { Allocation, StrategyKey } from "@/lib/api";
import {
  STRATEGY_ORDER,
  STRATEGY_COLOR,
  STRATEGY_LABEL,
  money,
  signedMoney,
} from "@/lib/allocation";
import { Donut } from "@/components/app/Donut";

function PnlCell({
  value,
  apy,
}: {
  value?: number;
  apy?: number | null;
}) {
  return (
    <>
      {value === undefined ? (
        <span className="text-dim">—</span>
      ) : (
        <span className={value >= 0 ? "text-mint" : "text-danger"}>
          {signedMoney(value)}
        </span>
      )}
      {apy != null && (
        <span className="block text-xs text-periwinkle">
          {apy.toFixed(1)}% APY
        </span>
      )}
    </>
  );
}

export function AllocationCard({
  allocation,
  total,
  pnl,
  stockApy,
}: {
  allocation: Allocation;
  total: number;
  pnl: Partial<Record<StrategyKey, number>>;
  stockApy?: number | null;
}) {
  const invested = STRATEGY_ORDER.reduce((s, k) => s + allocation[k], 0);
  const cashPct = Math.max(0, 100 - invested);

  return (
    <section className="rounded-2xl border border-line bg-field p-6">
      <h2 className="font-display text-xl font-semibold">
        Where your money is
      </h2>
      <div className="mt-6 grid items-center gap-8 md:grid-cols-[240px_1fr]">
        <Donut allocation={allocation} total={total} />
        <div>
          <div className="flex items-center gap-3 pb-2 text-xs text-dim">
            <span className="flex-1">Strategy</span>
            <span className="w-12 text-right">Share</span>
            <span className="w-20 text-right">Profit / loss</span>
            <span className="w-20 text-right">Amount</span>
          </div>
          <ul className="divide-y divide-line">
            {STRATEGY_ORDER.map((key) => (
              <li key={key} className="flex items-center gap-3 py-3">
                <span
                  className="h-3 w-3 shrink-0 rounded-sm"
                  style={{ background: STRATEGY_COLOR[key] }}
                />
                <span className="flex-1">{STRATEGY_LABEL[key]}</span>
                <span className="w-12 text-right tabular-nums">
                  {allocation[key]}%
                </span>
                <span className="w-20 text-right text-sm tabular-nums">
                  <PnlCell
                    value={pnl[key]}
                    apy={key === "robinhood" ? stockApy : null}
                  />
                </span>
                <span className="w-20 text-right tabular-nums text-muted">
                  {money((allocation[key] / 100) * total)}
                </span>
              </li>
            ))}
            {cashPct > 0 && (
              <li className="flex items-center gap-3 py-3 text-muted">
                <span className="h-3 w-3 shrink-0 rounded-sm bg-line-strong" />
                <span className="flex-1">Cash</span>
                <span className="w-12 text-right tabular-nums">{cashPct}%</span>
                <span className="w-20" />
                <span className="w-20 text-right tabular-nums">
                  {money((cashPct / 100) * total)}
                </span>
              </li>
            )}
          </ul>
        </div>
      </div>
      <p className="mt-4 text-xs text-dim">
        Profit / loss is estimated from Nova's positions on Hyperliquid and the
        yield credited from stock rotation on Robinhood Chain.
      </p>
    </section>
  );
}