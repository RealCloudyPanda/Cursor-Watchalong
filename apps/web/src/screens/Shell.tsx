import { Brand } from "@watchalong/ui/components/brand";
import type { ReactNode } from "react";

/** Centered single-card layout with a soft brand glow, used by the pre-room screens. */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-primary/15 blur-[120px]"
      />
      <header className="relative z-10 px-6 py-5">
        <Brand />
      </header>
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-16">
        {children}
      </main>
    </div>
  );
}
