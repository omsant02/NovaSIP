type Props = {
  id?: string;
  tone?: "base" | "deep";
  className?: string;
  children: React.ReactNode;
};

export function Section({ id, tone = "base", className = "", children }: Props) {
  return (
    <section id={id} className={tone === "deep" ? "bg-deep" : undefined}>
      <div className={`mx-auto max-w-[1200px] px-6 py-[104px] ${className}`}>
        {children}
      </div>
    </section>
  );
}