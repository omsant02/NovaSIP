import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";

const TIERS = ["Conservative", "Balanced", "Aggressive"];

const ROWS: { name: string; why: string; caps: [number, number, number] }[] = [
  {
    name: "Delta-neutral carry",
    why: "Market-neutral, so the cap is the same for every plan.",
    caps: [40, 40, 40],
  },
  {
    name: "USDC lending",
    why: "Liquid and steady. Cautious plans lean on it.",
    caps: [60, 40, 30],
  },
  {
    name: "HLP vault",
    why: "Higher yield, with a four-day lockup and bigger swings.",
    caps: [5, 15, 25],
  },
  {
    name: "Directional",
    why: "Price risk, so it is off for conservative plans.",
    caps: [0, 10, 25],
  },
  {
    name: "Stock tokens held",
    why: "Price risk grows with the risk level.",
    caps: [40, 70, 100],
  },
  {
    name: "Stocks in USDG on Morpho",
    why: "Dollars earning lending interest while a stock waits.",
    caps: [100, 100, 100],
  },
];

export function Limits() {
  return (
    <Section id="limits" tone="deep">
      <SectionHeading
        title="Hard limits, whatever the AI decides."
        body="The most of your money each strategy can hold."
      />
      <div className="mt-14 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left">
          <thead>
            <tr className="text-muted">
              <th className="pb-4 text-base font-medium">Strategy</th>
              {TIERS.map((t) => (
                <th key={t} className="pb-4 text-right text-base font-medium">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line border-t border-line">
            {ROWS.map((r) => (
              <tr key={r.name}>
                <td className="py-5 pr-6">
                  <div className="text-lg font-semibold">{r.name}</div>
                  <div className="mt-1 text-base text-dim">{r.why}</div>
                </td>
                {r.caps.map((c, i) => (
                  <td
                    key={i}
                    className={`py-5 text-right font-display text-2xl tabular-nums ${
                      c === 0 ? "text-dim" : ""
                    }`}
                  >
                    {c === 0 ? "Off" : `${c}%`}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-6 max-w-[620px] text-base leading-relaxed text-dim">
        These are maximums per strategy, not a recommended mix. Nova only uses
        funds on the chain they were deposited on, and never moves more than
        20% of your portfolio in one cycle.
      </p>
    </Section>
  );
}