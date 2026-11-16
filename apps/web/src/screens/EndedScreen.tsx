import { Button } from "@watchalong/ui/components/ui/button";
import { Card, CardContent } from "@watchalong/ui/components/ui/card";
import { DoorOpen, Hand, RefreshCw, WifiOff } from "lucide-react";
import type { EndReason } from "../session/guest-session";
import { Shell } from "./Shell";

const COPY: Record<EndReason, { icon: React.ReactNode; title: string; body: string }> = {
  "room-ended": {
    icon: <DoorOpen className="size-6" />,
    title: "The session has ended",
    body: "Thanks for watching along.",
  },
  denied: {
    icon: <Hand className="size-6" />,
    title: "The host didn't let you in",
    body: "You can ask them to send the link again.",
  },
  kicked: {
    icon: <Hand className="size-6" />,
    title: "You were removed from the session",
    body: "The host removed you from this room.",
  },
  left: {
    icon: <DoorOpen className="size-6" />,
    title: "You left the session",
    body: "Open the invite link again to rejoin.",
  },
  lost: {
    icon: <WifiOff className="size-6" />,
    title: "Disconnected",
    body: "We lost the connection to the session.",
  },
};

export function EndedScreen({ reason }: { reason: EndReason }) {
  const copy = COPY[reason];
  return (
    <Shell>
      <Card className="w-full max-w-sm border-border/60 bg-card/80 text-center shadow-2xl shadow-black/40 backdrop-blur">
        <CardContent className="flex flex-col items-center gap-5 py-10">
          <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            {copy.icon}
          </span>
          <div className="space-y-1.5">
            <h1 className="text-lg font-semibold">{copy.title}</h1>
            <p className="text-sm text-muted-foreground">{copy.body}</p>
          </div>
          {(reason === "lost" || reason === "denied" || reason === "left") && (
            <Button variant="secondary" onClick={() => window.location.reload()}>
              <RefreshCw />
              Try again
            </Button>
          )}
        </CardContent>
      </Card>
    </Shell>
  );
}
