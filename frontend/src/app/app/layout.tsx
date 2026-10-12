import type { ReactNode } from "react";
import { Providers } from "@/components/app/Providers";
import { TopBar } from "@/components/app/TopBar";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <TopBar />
      <main className="mx-auto max-w-[1200px] px-6 py-10">{children}</main>
    </Providers>
  );
}