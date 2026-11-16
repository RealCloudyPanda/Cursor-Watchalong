import { cn } from "../lib/utils";

const TONES = {
  live: "bg-success",
  warn: "bg-warning",
  error: "bg-destructive",
  idle: "bg-muted-foreground",
} as const;

/** Small status dot; `pulse` adds a soft expanding ring for "live" states. */
export function StatusDot({
  tone = "live",
  pulse,
  className,
}: {
  tone?: keyof typeof TONES;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex size-2", className)}>
      {pulse && (
        <span className={cn("absolute inset-0 rounded-full animate-pulse-ring", TONES[tone])} />
      )}
      <span className={cn("relative inline-flex size-2 rounded-full", TONES[tone])} />
    </span>
  );
}
