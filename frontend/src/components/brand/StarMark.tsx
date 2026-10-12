type Props = {
  size?: number;
  className?: string;
  title?: string;
};

export function StarMark({ size = 30, className, title }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-24 -24 48 48"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path
        d="M0,-22 C2,-8 8,-2 22,0 C8,2 2,8 0,22 C-2,8 -8,2 -22,0 C-8,-2 -2,-8 0,-22 Z"
        fill="currentColor"
      />
    </svg>
  );
}