import { GoalCalculator } from "./GoalCalculator";

const TONES = {
  mint: { border: "border-mint/50", title: "text-mint" },
  periwinkle: { border: "border-periwinkle/50", title: "text-periwinkle" },
} as const;

function Engine({
  tone,
  title,
  body,
}: {
  tone: keyof typeof TONES;
  title: string;
  body: string;
}) {
  return (
    <div className={`border-l-2 pl-5 ${TONES[tone].border}`}>
      <div
        className={`font-display text-[28px] font-bold leading-none tracking-[-0.02em] ${TONES[tone].title}`}
      >
        {title}
      </div>
      <div className="mt-2 max-w-[420px] text-[18px] leading-snug text-muted">
        {body}
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section id="top" className="mx-auto max-w-[1200px] px-6 pb-20 pt-12">
      <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_500px]">
        <div className="flex min-w-0 flex-col gap-8">
          <h1 className="font-display text-[clamp(44px,6vw,80px)] font-extrabold leading-[0.95] tracking-[-0.045em]">
            <span className="block">Set the goal.</span>
            <span className="block">Nova does</span>
            <span className="block">the rest.</span>
          </h1>
          <p className="max-w-[460px] text-[21px] leading-[1.45] text-muted">
            Automated investing for your savings goals. Every move explained.
          </p>
          <div className="flex flex-col gap-6">
            <Engine
              tone="mint"
              title="Crypto yield"
              body="Earns while the market moves, inside hard risk limits."
            />
            <Engine
              tone="periwinkle"
              title="Stock tokens"
              body="Sold high into dollars that earn interest while they wait."
            />
          </div>
        </div>

        <GoalCalculator />
      </div>
    </section>
  );
}