import type { Allocation } from "@/lib/api";
import {
  STRATEGY_ORDER,
  STRATEGY_COLOR,
  STRATEGY_LABEL,
  money,
} from "@/lib/allocation";

const SIZE = 240;
const R = 92;
const STROKE = 28;
const C = 2 * Math.PI * R;

export function Donut({
  allocation,
  total,
}: {
  allocation: Allocation;
  total: number;
}) {
  let offset = 0;
  return (
    <div className="relative mx-auto" style={{ width: SIZE, height: SIZE }}>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="-rotate-90"
        role="img"
        aria-label="Portfolio allocation by strategy"
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth={STROKE}
        />
        {STRATEGY_ORDER.map((key) => {
          const pct = allocation[key];
          if (!pct) return null;
          const len = (pct / 100) * C;
          const el = (
            <circle
              key={key}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              stroke={STRATEGY_COLOR[key]}
              strokeWidth={STROKE}
              strokeDasharray={`${Math.max(len - 3, 0)} ${C}`}
              strokeDashoffset={-offset}
            >
              <title>{`${STRATEGY_LABEL[key]}: ${pct}%`}</title>
            </circle>
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs text-dim">Total</span>
        <span className="font-display text-2xl font-semibold">
          {money(total)}
        </span>
      </div>
    </div>
  );
}