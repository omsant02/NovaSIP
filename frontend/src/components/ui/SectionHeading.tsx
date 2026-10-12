type Props = {
  title: string;
  body?: string;
};

export function SectionHeading({ title, body }: Props) {
  return (
    <div className="flex max-w-[760px] flex-col gap-5">
      <h2 className="font-display text-[clamp(40px,5vw,60px)] font-bold leading-[1.02] tracking-[-0.04em]">
        {title}
      </h2>
      {body ? (
        <p className="text-xl leading-relaxed text-muted">{body}</p>
      ) : null}
    </div>
  );
}