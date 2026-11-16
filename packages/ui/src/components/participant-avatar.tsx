import { Crown } from "lucide-react";
import { cn } from "../lib/utils";

interface ParticipantAvatarProps {
  name: string;
  color: string;
  isHost?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = { sm: "size-7 text-xs", md: "size-9 text-sm", lg: "size-12 text-base" };

/** Colored initial avatar matching the person's cursor color. */
export function ParticipantAvatar({
  name,
  color,
  isHost,
  size = "md",
  className,
}: ParticipantAvatarProps) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full font-semibold text-black/80 ring-2 ring-background",
          SIZES[size],
        )}
        style={{ backgroundColor: color }}
        title={name}
      >
        {initial}
      </span>
      {isHost && (
        <span className="absolute -top-1 -right-1 inline-flex size-4 items-center justify-center rounded-full bg-warning text-black ring-2 ring-background">
          <Crown className="size-2.5" strokeWidth={3} />
        </span>
      )}
    </span>
  );
}
