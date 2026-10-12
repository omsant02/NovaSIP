import Link from "next/link";
import { StarMark } from "./StarMark";

type Props = {
  size?: "sm" | "md";
};

export function Logo({ size = "md" }: Props) {
  const mark = size === "md" ? 30 : 24;
  const text = size === "md" ? "text-2xl" : "text-xl";

  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="NovaSIP home">
      <StarMark size={mark} className="text-gold" />
      <span
        className={`font-display font-bold tracking-[-0.03em] ${text}`}
      >
        Nova<span className="font-medium">SIP</span>
      </span>
    </Link>
  );
}