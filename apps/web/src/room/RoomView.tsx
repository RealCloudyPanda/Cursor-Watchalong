import type { GuestMessage } from "@watchalong/protocol";
import { useCallback, useEffect, useRef } from "react";
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

  return (
    <div className="flex h-svh flex-col bg-black">
      <TopBar state={state} onLeave={() => session.leave()} />
      <Stage session={session} state={state} />
      <ControlBar
        media={state.mediaState}
        mediaAt={state.mediaAt}
        canControl={canControl}
        onCommand={command}
      />
    </div>
  );
}
