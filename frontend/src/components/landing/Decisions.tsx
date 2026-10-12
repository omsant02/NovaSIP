import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";

type Stock = { symbol: string; pct: number };

// Where each stock sat in its 52-week range during a real testnet run.
const STOCKS: Stock[] = [
  { symbol: "PLTR", pct: 94 },
  { symbol: "AMD", pct: 85 },
  { symbol: "AMZN", pct: 70 },
  { symbol: "TSLA", pct: 40 },
  { symbol: "NFLX", pct: 10 },
];

// Nova sells everything at 80% or higher, half from 65%, and holds below that.
const THRESHOLDS = [65, 80];

function decide(pct: number) {
  if (pct >= 80) return { label: "Sold into dollars", accent: true };
  if (pct >= 65) return { label: "Half sold into dollars", accent: true };
  return { label: pct < 30 ? "Held, near its low" : "Held", accent: false };
}

function RangeBar({ symbol, pct }: Stock) {
  return (
    <div
      className="relative h-2 rounded-full bg-line"
      role="img"
      aria-label={`${symbol} sits at ${pct}% of its 52-week range`}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-periwinkle/60"
        style={{ width: `${pct}%` }}
      />
      {THRESHOLDS.map((t) => (
        <span
          key={t}
          className="absolute -top-1 h-4 w-px bg-line-strong"
          style={{ left: `${t}%` }}
        />
      ))}
      <span
        className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold"
        style={{ left: `${pct}%` }}
      />
    </div>
  );
}

export function Decisions() {
  return (
    <Section id="decisions">
      <SectionHeading
        title="Every move comes with a reason."
        body="Nova checks where each stock sits in its 52-week range, then decides one stock at a time."
      />
      <ul className="mt-14 flex flex-col divide-y divide-line border-y border-line">
        {STOCKS.map((s) => {
          const d = decide(s.pct);
          return (
            <li
              key={s.symbol}
              className="grid items-center gap-x-8 gap-y-3 py-6 md:grid-cols-[88px_1fr_64px_240px]"
            >
              <span className="font-display text-2xl font-bold">
                {s.symbol}
              </span>
              <RangeBar symbol={s.symbol} pct={s.pct} />
              <span className="tabular-nums text-muted md:text-right">
                {s.pct}%
              </span>
              <span
                className={`text-lg ${
                  d.accent ? "font-semibold text-periwinkle" : "text-muted"
                }`}
              >
                {d.label}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-6 max-w-[620px] text-base leading-relaxed text-dim">
        At 80% of its yearly range or higher, Nova sells a stock into dollars
        that earn interest. From 65%, it sells half. Below that, it holds.
        Values from a real testnet run.
      </p>
    </Section>
  );
}