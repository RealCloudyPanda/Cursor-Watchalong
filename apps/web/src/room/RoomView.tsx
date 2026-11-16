import { useEffect } from "react";
import { toast } from "sonner";
import type { GuestSession, GuestState } from "../session/guest-session";
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

  return (
    <div className="flex h-svh flex-col bg-black">
      <TopBar state={state} onLeave={() => session.leave()} />
      <Stage session={session} state={state} />
    </div>
  );
}
