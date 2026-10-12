type Props = {
  tone?: "mint" | "periwinkle" | "neutral";
  children: React.ReactNode;
};

const tones = {
  mint: "bg-[#0f3b3b] text-[#8cf0de]",
  periwinkle: "bg-[#232c5c] text-[#b7c3ff]",
  neutral: "bg-[#2a2a3f] text-starlight",
};

export function Pill({ tone = "neutral", children }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3.5 py-2 text-[15px] ${tones[tone]}`}
    >
      {children}
    </span>
  );
}