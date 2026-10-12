import { Section } from "@/components/ui/Section";

const SAMPLE = [
  {
    when: "Example",
    title: "Moved 20% into lending",
    why: "ETH funding turned negative, so the carry trade stopped paying. Lending was the best safe yield.",
  },
  {
    when: "Example",
    title: "Held steady",
    why: "Nothing beat what you already own after fees. Doing nothing was the decision.",
  },
  {
    when: "Example",
    title: "Opened a delta-neutral ETH carry",
    why: "Funding was positive and stable. Long spot plus short perp earns the funding without price risk.",
  },
];

export function ActivityPreview() {
  return (
    <Section tone="deep">
      <h2 className="font-display text-4xl font-semibold tracking-tight">
        Every move comes with a reason.
      </h2>
      <p className="mt-4 max-w-xl text-muted">
        Nova writes down what it did and why, in plain words. You can read it,
        question it, or pause it any time.
      </p>
      <ul className="mt-10 grid gap-4 md:grid-cols-3">
        {SAMPLE.map((d) => (
          <li key={d.title} className="rounded-2xl border border-line bg-field p-6">
            <span className="text-xs uppercase tracking-wider text-dim">{d.when}</span>
            <h3 className="mt-3 font-display text-lg font-semibold">{d.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{d.why}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}