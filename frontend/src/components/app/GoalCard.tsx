import type { Profile } from "@/lib/api";
import { money, signedMoney } from "@/lib/allocation";
import { monthsUntil } from "@/lib/dates";
import { calcPlan } from "@/lib/plan";
import { GoalPath } from "@/components/landing/GoalPath";

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "gain" | "loss";
}) {
  const color =
    tone === "gain" ? "text-mint" : tone === "loss" ? "text-danger" : "";
  return (
    <div>
      <p className="text-xs text-dim">{label}</p>
      <p className={`mt-1 font-display text-xl font-semibold tabular-nums ${color}`}>
        {value}
      </p>
    </div>
  );
}

export function GoalCard({
  profile,
  total,
  pnl,
}: {
  profile: Profile;
  total: number;
  pnl?: number | null;
}) {
  const remaining = Math.max(profile.targetUsd - total, 0);
  const months = monthsUntil(profile.goalDate);
  const plan =
    months > 0 && remaining > 0
      ? calcPlan(remaining, months, profile.tier)
      : null;
  const dateLabel = profile.goalDate
    ? new Date(profile.goalDate).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : "no date set";

  return (
    <section className="rounded-2xl border border-line bg-field p-6">
      <h2 className="font-display text-xl font-semibold">{profile.goalName}</h2>
      <p className="mt-1 text-sm text-muted">
        Target {money(profile.targetUsd)} by {dateLabel}
      </p>

      <div className="mt-5">
        {plan ? (
          <GoalPath points={plan.points} months={months} />
        ) : (
          <p className="rounded-xl bg-deep px-4 py-6 text-sm text-muted">
            {remaining === 0
              ? "You've reached your target."
              : "Tell Nova a goal date to see your path."}
          </p>
        )}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="You've put in" value={money(total)} />
        <Stat
          label="Profit / loss"
          value={pnl == null ? "—" : signedMoney(pnl)}
          tone={pnl == null ? undefined : pnl >= 0 ? "gain" : "loss"}
        />
        <Stat label="Months left" value={months > 0 ? String(months) : "0"} />
        <Stat
          label="Monthly deposit needed"
          value={plan ? money(plan.pmt) : "n/a"}
        />
      </div>

      <p className="mt-4 text-xs text-dim">
        The path is an illustrative projection. Real yields vary and are not
        promised.
      </p>
    </section>
  );
}