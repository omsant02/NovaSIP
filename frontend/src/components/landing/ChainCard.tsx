import { Pill } from "@/components/ui/Pill";

type Props = {
  name: string;
  dotClass: string;
  description: string;
  tags: string[];
  tone: "mint" | "periwinkle";
};

export function ChainCard({ name, dotClass, description, tags, tone }: Props) {
  return (
    <div className="flex min-w-0 flex-1 basis-[460px] flex-col gap-5 rounded-[28px] bg-field p-9">
      <div className="flex items-center gap-3">
        <span className={`h-3.5 w-3.5 rounded-full ${dotClass}`} />
        <span className="font-display text-[30px] font-semibold tracking-[-0.03em]">
          {name}
        </span>
      </div>
      <p className="text-lg leading-relaxed text-muted">{description}</p>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <Pill key={tag} tone={tone}>
            {tag}
          </Pill>
        ))}
      </div>
    </div>
  );
}