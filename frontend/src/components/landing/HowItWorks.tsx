import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";

const STEPS = [
  {
    title: "Say what you're saving for",
    body: "\"I want $5,000 for a Europe trip in 8 months.\" Plain English is enough. Nova turns it into a plan and a risk level.",
  },
  {
    title: "Deposit once",
    body: "Add USDC from your wallet, or set a monthly deposit like an Indian SIP. Your funds sit in a vault contract, not with us.",
  },
  {
    title: "Watch it work",
    body: "Nova reads live funding rates, lending yields and price ranges, rebalances inside your limits, and writes down why.",
  },
];

export function HowItWorks() {
  return (
    <Section id="how" className="flex flex-col gap-14">
      <SectionHeading title="Three steps, then it runs itself." />
      <ol className="flex list-none flex-wrap gap-6 p-0">
        {STEPS.map((step, i) => (
          <li
            key={step.title}
            className="flex min-w-0 flex-1 basis-[320px] flex-col gap-3.5"
          >
            <span className="font-display text-[64px] font-bold leading-none tracking-[-0.04em] text-gold">
              {i + 1}
            </span>
            <span className="text-[26px] font-semibold tracking-[-0.02em]">
              {step.title}
            </span>
            <p className="text-lg leading-relaxed text-muted">{step.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}