import { Section } from "@/components/ui/Section";

const TIERS = ["Conservative", "Balanced", "Aggressive"];
const ROWS: { name: string; caps: [number, number, number] }[] = [
  { name: "ETH carry", caps: [40, 40, 40] },
  { name: "Lending", caps: [60, 40, 30] },
  { name: "HLP vault", caps: [5, 15, 25] },
  { name: "Directional", caps: [0, 10, 25] },
  { name: "Robinhood stocks", caps: [40, 40, 30] },
];

export function Limits() {
  return (
    <Section id="limits">
      <h2 className="font-display text-4xl font-semibold tracking-tight">
        Nova has hard limits.
      </h2>
      <p className="mt-4 max-w-xl text-muted">
        Maximum share of your money each strategy can hold. The AI can't go past
        these, whatever it decides.
      </p>
      <div className="mt-10 overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="bg-field text-muted">
            <tr>
              <th className="px-5 py-4 font-medium">Strategy</th>
              {TIERS.map((t) => (
                <th key={t} className="px-5 py-4 font-medium">{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.name} className="border-t border-line">
                <td className="px-5 py-4">{r.name}</td>
                {r.caps.map((c, i) => (
                  <td key={i} className="px-5 py-4 tabular-nums text-muted">
                    {c === 0 ? "Off" : `${c}%`}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-sm text-dim">
        Also: no more than 20% moves in one cycle, and a pause button that
        always works.
      </p>
    </Section>
  );
}