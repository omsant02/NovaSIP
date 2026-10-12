import Link from "next/link";

type Props = {
  href: string;
  variant?: "primary" | "secondary";
  size?: "md" | "lg";
  children: React.ReactNode;
  className?: string;
};

const variants = {
  primary: "bg-gold font-bold text-gold-ink hover:bg-[#ffc968]",
  secondary:
    "border border-line-strong font-semibold text-starlight hover:border-muted",
};

const sizes = {
  md: "h-11 rounded-xl px-5 text-base",
  lg: "h-14 rounded-2xl px-8 text-lg",
};

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  children,
  className = "",
}: Props) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center transition-colors ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </Link>
  );
}