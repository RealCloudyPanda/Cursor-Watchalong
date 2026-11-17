import { formatTime, type GuestMessage, type MediaState } from "@watchalong/protocol";
import { Button } from "@watchalong/ui/components/ui/button";
import { Kbd } from "@watchalong/ui/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@watchalong/ui/components/ui/popover";
import { Slider } from "@watchalong/ui/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@watchalong/ui/components/ui/tooltip";
import { cn } from "@watchalong/ui/lib/utils";
import { Keyboard, Pause, Play, RotateCcw, RotateCw, Volume2, VolumeX } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useMediaClock } from "../hooks/useMediaClock";

type Media = Extract<GuestMessage, { type: "media" }>;

interface ControlBarProps {
  media: MediaState | null;
  mediaAt: number;
  canControl: boolean;
  onCommand: (command: Media) => void;
  /** Extra tools on the right, such as the Draw toggle. */
  tools?: ReactNode;
}

export function ControlBar({ media, mediaAt, canControl, onCommand, tools }: ControlBarProps) {
  const time = useMediaClock(media, mediaAt);
  // Preview position only while the thumb is dragged with a pointer; keyboard seeks commit directly.
  const [scrub, setScrub] = useState<number | null>(null);
  const dragging = useRef(false);
  const hasVideo = !!media?.hasVideo;
  const disabled = !canControl || !hasVideo;
  const duration = media?.duration ?? 0;
  const seekable = duration > 0;
  const shown = scrub ?? time;
  useEffect(() => {
    if (disabled) {
      dragging.current = false;
      setScrub(null);
    }
  }, [disabled]);
  const reason = !hasVideo
    ? "No video found in the shared tab"
    : "The host hasn't given you control";

  return (
    <div
      role="toolbar"
      className="flex h-16 shrink-0 items-center gap-1.5 border-t border-border/60 bg-background/90 px-2 backdrop-blur sm:gap-2 sm:px-4"
      aria-label="Playback controls"
    >
      <Gate disabled={disabled} reason={reason}>
        <Button
          size="icon"
          className="size-10 rounded-full"
          disabled={disabled}
          onClick={() => onCommand({ type: "media", action: "toggle" })}
          aria-label={media?.paused === false ? "Pause" : "Play"}
        >
          {media?.paused === false ? (
            <Pause className="fill-current" />
          ) : (
            <Play className="fill-current" />
          )}
        </Button>
      </Gate>
      <Gate disabled={disabled} reason={reason}>
        <Button
          size="icon"
          variant="ghost"
          disabled={disabled || !seekable}
          onClick={() => onCommand({ type: "media", action: "seekBy", value: -10 })}
          aria-label="Back 10 seconds"
          className="hidden sm:inline-flex"
        >
          <RotateCcw />
        </Button>
      </Gate>
      <Gate disabled={disabled} reason={reason}>
        <Button
          size="icon"
          variant="ghost"
          disabled={disabled || !seekable}
          onClick={() => onCommand({ type: "media", action: "seekBy", value: 10 })}
          aria-label="Forward 10 seconds"
          className="hidden sm:inline-flex"
        >
          <RotateCw />
        </Button>
      </Gate>

      <span className="w-[5.5rem] shrink-0 text-center font-mono text-xs text-muted-foreground tabular-nums sm:w-28">
        {hasVideo
          ? `${formatTime(shown)} / ${seekable ? formatTime(duration) : "Live"}`
          : "No video"}
      </span>

      <div className="min-w-0 flex-1 px-1">
        <Slider
          aria-label="Seek"
          disabled={disabled || !seekable}
          min={0}
          max={seekable ? duration : 1}
          step={0.1}
          value={[seekable ? Math.min(shown, duration) : 0]}
          thumbLabel="Seek"
          thumbValueText={`${formatTime(shown)} of ${formatTime(duration)}`}
          onPointerDown={() => {
            dragging.current = true;
          }}
          onValueChange={([v]) => {
            if (dragging.current) setScrub(v ?? null);
          }}
          onValueCommit={([v]) => {
            dragging.current = false;
            setScrub(null);
            if (v !== undefined) onCommand({ type: "media", action: "seek", value: v });
          }}
          className={cn(!seekable && "opacity-50")}
        />
      </div>

      <Gate disabled={disabled} reason={reason}>
        <Button
          size="icon"
          variant="ghost"
          disabled={disabled}
          onClick={() => onCommand({ type: "media", action: media?.muted ? "unmute" : "mute" })}
          aria-label={media?.muted ? "Unmute the video" : "Mute the video"}
        >
          {media?.muted ? <VolumeX /> : <Volume2 />}
        </Button>
      </Gate>

      {tools}
      <ShortcutsHelp />
    </div>
  );
}

/** Wraps a control so a disabled button still explains why on hover. */
function Gate({
  disabled,
  reason,
  children,
}: {
  disabled: boolean;
  reason: string;
  children: ReactNode;
}) {
  if (!disabled) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>{children}</span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

const SHORTCUTS: [string[], string][] = [
  [["Space", "K"], "Play / pause"],
  [["J", "L"], "Back / forward 10s"],
  [["←", "→"], "Back / forward 5s"],
  [["M"], "Mute"],
  [["Alt"], "Hold to draw"],
  [["D"], "Toggle draw mode"],
];

function ShortcutsHelp() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Keyboard shortcuts"
          className="hidden sm:inline-flex"
        >
          <Keyboard />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="w-64">
        <p className="mb-2 text-sm font-medium">Keyboard shortcuts</p>
        <ul className="space-y-1.5 text-sm">
          {SHORTCUTS.map(([keys, label]) => (
            <li key={label} className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{label}</span>
              <span className="flex gap-1">
                {keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
