import type { ReactNode } from "react";

export function EmptyState({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <section className="mx-auto max-w-xl rounded-2xl border border-line bg-field p-10 text-center">
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        {title}
      </h1>
      <p className="mt-3 text-muted">{body}</p>
      {children && <div className="mt-8 flex justify-center">{children}</div>}
    </section>
  );
}