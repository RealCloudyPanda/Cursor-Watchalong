import { Button } from "@watchalong/ui/components/ui/button";
import { Card, CardContent } from "@watchalong/ui/components/ui/card";
import { Loader2 } from "lucide-react";
import { Shell } from "./Shell";

export function WaitingScreen({
  phase,
  onCancel,
}: {
  phase: "connecting" | "waiting";
  onCancel: () => void;
}) {
  return (
    <Shell>
      <Card className="w-full max-w-sm border-border/60 bg-card/80 text-center shadow-2xl shadow-black/40 backdrop-blur">
        <CardContent className="flex flex-col items-center gap-5 py-10">
          <span className="relative flex size-14 items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-primary/30 animate-pulse-ring" />
            <span className="relative flex size-14 items-center justify-center rounded-full bg-primary/15">
              <Loader2 className="size-6 animate-spin text-primary" />
            </span>
          </span>
          <div className="space-y-1.5" aria-live="polite">
            <h1 className="text-lg font-semibold">
              {phase === "connecting" ? "Connecting…" : "Waiting for the host"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {phase === "connecting"
                ? "Reaching the session."
                : "They'll see your name and let you in. Keep this tab open."}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </CardContent>
      </Card>
    </Shell>
  );
}
