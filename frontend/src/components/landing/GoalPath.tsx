import { StarMark } from "@/components/brand/StarMark";
import { GOAL_STAR, type PathPoint } from "@/lib/plan";

type Props = {
  points: PathPoint[];
  months: number;
  goalLabel?: string;
};

export function GoalPath({ points, months, goalLabel }: Props) {
  const line = [...points, GOAL_STAR]
    .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");

  return (
    <div className="relative h-[200px] overflow-hidden rounded-[20px] bg-midnight">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <polyline
          points={line}
          fill="none"
          stroke="#eaf0ff"
          strokeOpacity="0.18"
          strokeWidth="0.6"
          strokeDasharray="1 2.2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {points.map((p, i) => (
        <div
          key={i}
          className="ns-dot absolute h-2.5 w-2.5 rounded-full bg-gold"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            animationDelay: `${Math.round(150 + ((i + 1) / points.length) * 900)}ms`,
          }}
        />
      ))}

      <div
        className="ns-star absolute"
        style={{ left: `${GOAL_STAR.x}%`, top: `${GOAL_STAR.y}%` }}
      >
        {goalLabel && (
          <span className="absolute right-full top-1/2 -translate-y-1/2 whitespace-nowrap pr-1 font-display text-lg font-bold text-gold">
            {goalLabel}
          </span>
        )}
        <StarMark size={40} className="text-gold" title="Your goal" />
      </div>

      <div className="absolute bottom-3 left-4 text-sm text-dim">Today</div>
      <div className="absolute bottom-3 right-4 text-sm text-dim">
        Month {months}
      </div>
    </div>
  );
}
