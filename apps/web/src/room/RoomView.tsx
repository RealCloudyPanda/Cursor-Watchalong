import type { GuestMessage } from "@watchalong/protocol";
import { Kbd } from "@watchalong/ui/components/ui/kbd";
import { Toggle } from "@watchalong/ui/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@watchalong/ui/components/ui/tooltip";
import { PenLine } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useShortcuts } from "../hooks/useShortcuts";
import type { GuestSession, GuestState } from "../session/guest-session";
import { ControlBar } from "./ControlBar";
import { Stage } from "./Stage";
import { TopBar } from "./TopBar";

export function RoomView({ session, state }: { session: GuestSession; state: GuestState }) {
  useEffect(
    () =>
      session.onEvent((event) => {
        if (event.type === "activity") {
          toast(`${event.by?.name ?? "Someone"} ${event.text}`, { duration: 2500 });
        } else if (event.reason === "no-control") {
          toast("The host hasn't given you control", {
            id: "no-control",
            description: "You can still point and draw.",
          });
        } else {
          toast("Slow down a little", { id: "rate-limited" });
        }
      }),
    [session],
  );

  const canControl = !!state.me?.canControl;
  const lastHint = useRef(0);
  const noControl = useCallback(() => {
    if (Date.now() - lastHint.current < 4_000) return;
    lastHint.current = Date.now();
    toast("The host hasn't given you control", {
      id: "no-control",
      description: "You can still point and draw.",
    });
  }, []);

  const command = useCallback(
    (message: Extract<GuestMessage, { type: "media" }>) => {
      if (!canControl) return noControl();
      if (!session.send(message)) toast("Still connecting to the host…", { id: "not-ready" });
    },
    [canControl, noControl, session],
  );

  useShortcuts(state.phase === "live", !!state.mediaState?.muted, command);

  // Draw mode: pinned with the Draw button or D, or held with Alt.
  const [pinned, setPinned] = useState(false);
  const [altHeld, setAltHeld] = useState(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Alt") {
        e.preventDefault();
        setAltHeld(true);
      } else if (e.key === "Escape") {
        setPinned(false);
      } else if (
        (e.key === "d" || e.key === "D") &&
        !e.repeat &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !(e.target as HTMLElement | null)?.closest("input, textarea, [contenteditable='true']")
      ) {
        setPinned((p) => !p);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Alt") setAltHeld(false);
    };
    const reset = () => setAltHeld(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", reset);
    };
  }, []);
  const drawing = pinned || altHeld;
  const myColor = state.me?.color ?? "#4dabf7";

  return (
    <div className="flex h-svh flex-col bg-black">
      <TopBar state={state} onLeave={() => session.leave()} />
      <Stage session={session} state={state} drawing={drawing} onNoControl={noControl} />
      <ControlBar
        media={state.mediaState}
        mediaAt={state.mediaAt}
        canControl={canControl}
        onCommand={command}
        tools={
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle
                pressed={drawing}
                onPressedChange={setPinned}
                variant="outline"
                aria-label="Draw mode"
                className="gap-2 aria-pressed:border-primary aria-pressed:bg-primary/15 aria-pressed:text-primary"
              >
                <PenLine />
                <span className="hidden md:inline">Draw</span>
                <span
                  aria-hidden
                  className="size-2.5 rounded-full ring-1 ring-white/40"
                  style={{ backgroundColor: myColor }}
                />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>
              Draw on the tab. Press <Kbd>D</Kbd> or hold <Kbd>Alt</Kbd>
            </TooltipContent>
          </Tooltip>
        }
      />
    </div>
  );
}
