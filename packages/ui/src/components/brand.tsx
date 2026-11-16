import { cn } from "../lib/utils";

/** The Watchalong mark: a cursor arrow with the brand gradient. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={cn("size-8 shrink-0", className)}>
      <defs>
        <linearGradient id="wa-brand" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#f472b6" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="oklch(0.22 0.012 285)" />
      <path
        d="M19 13l28 15.5-12.2 3.3 7.4 13.4-5.3 2.9-7.4-13.4L21 43.8z"
        fill="url(#wa-brand)"
        stroke="white"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Brand({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <BrandMark className={compact ? "size-7" : "size-8"} />
      <span className={cn("font-semibold tracking-tight", compact ? "text-sm" : "text-base")}>
        Cursor <span className="text-primary">Watchalong</span>
      </span>
    </div>
  );
}
