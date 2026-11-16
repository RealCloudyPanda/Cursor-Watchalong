import { Card, CardContent } from "@watchalong/ui/components/ui/card";
import { Link2, MousePointer2, PenLine, ShieldCheck } from "lucide-react";
import { Shell } from "./Shell";

const STEPS = [
  {
    icon: <Link2 className="size-5" />,
    title: "Share a tab",
    body: "The host clicks the extension on any tab and sends the invite link.",
  },
  {
    icon: <MousePointer2 className="size-5" />,
    title: "Point and play",
    body: "Everyone sees each other's cursors. With permission, guests pause, seek and click.",
  },
  {
    icon: <PenLine className="size-5" />,
    title: "Draw on it",
    body: "Circle the detail you spotted. Marks fade away after a few seconds.",
  },
  {
    icon: <ShieldCheck className="size-5" />,
    title: "Host stays in charge",
    body: "The host approves every guest and decides who can control the tab.",
  },
];

export function Landing() {
  return (
    <Shell>
      <div className="w-full max-w-3xl space-y-10 text-center">
        <div className="space-y-4">
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Watch together.{" "}
            <span className="bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent">
              Point together.
            </span>
          </h1>
          <p className="mx-auto max-w-xl text-pretty text-muted-foreground">
            Cursor Watchalong shares one live Chrome tab with your friends. They join from a link,
            no install needed. Open an invite link from a host to join a session.
          </p>
        </div>
        <div className="grid gap-3 text-left sm:grid-cols-2">
          {STEPS.map((s) => (
            <Card key={s.title} className="border-border/60 bg-card/70">
              <CardContent className="flex gap-3.5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  {s.icon}
                </span>
                <div className="space-y-1">
                  <h2 className="font-medium">{s.title}</h2>
                  <p className="text-sm text-muted-foreground">{s.body}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </Shell>
  );
}
