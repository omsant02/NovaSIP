import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { CHAINS, STRATEGY_INFO } from "@/lib/strategies";

export function Strategies() {
  return (
    <Section id="strategies" className="flex flex-col gap-12">
      <SectionHeading title="Five ways your money works." />
      <ul className="m-0 flex list-none flex-col border-b border-line p-0">
        {STRATEGY_INFO.map((s) => (
          <li
            key={s.key}
            className="flex flex-wrap items-baseline gap-6 border-t border-line py-6"
          >
            <div className="min-w-[220px] flex-1 text-2xl font-semibold tracking-[-0.02em]">
              {s.name}
            </div>
            <p className="min-w-[280px] flex-[3] text-lg leading-relaxed text-muted">
              {s.blurb}
            </p>
            <div className="flex w-[150px] items-center gap-2 text-[15px]">
              <span
                className={`h-2.5 w-2.5 rounded-full ${CHAINS[s.chain].dotClass}`}
              />
              {CHAINS[s.chain].label}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}