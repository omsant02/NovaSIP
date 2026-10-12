"use client";

import { useMemo, useState } from "react";
import { usd } from "@/lib/format";
import { PLANS, calcPlan, type Tier } from "@/lib/plan";
import { GoalPath } from "./GoalPath";
import { PlanStats } from "./PlanStats";
import { RangeField } from "./RangeField";
import { TierPicker } from "./TierPicker";

export function GoalCalculator() {
  const [goal, setGoal] = useState(5000);
  const [months, setMonths] = useState(12);
  const [tier, setTier] = useState<Tier>("balanced");

  const plan = useMemo(
    () => calcPlan(goal, months, tier),
    [goal, months, tier],
  );

  return (
    <div className="flex flex-col gap-6 rounded-[28px] bg-field p-6">
      <div className="flex flex-col gap-5">
        <RangeField
          id="goal"
          label="I want to save"
          valueText={`$${usd(goal)}`}
          min={1000}
          max={20000}
          step={500}
          value={goal}
          onChange={setGoal}
        />
        <RangeField
          id="months"
          label="In"
          valueText={`${months} months`}
          min={3}
          max={36}
          step={1}
          value={months}
          onChange={setMonths}
        />
        <TierPicker value={tier} onChange={setTier} />
      </div>

      <GoalPath
        points={plan.points}
        months={months}
        goalLabel={`$${usd(goal)}`}
      />
      <PlanStats plan={plan} tierLabel={PLANS[tier].label} />
    </div>
  );
}
