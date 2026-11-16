import { MAX_NAME_LENGTH } from "@watchalong/protocol";
import { Alert, AlertDescription, AlertTitle } from "@watchalong/ui/components/ui/alert";
import { Button } from "@watchalong/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@watchalong/ui/components/ui/card";
import { Input } from "@watchalong/ui/components/ui/input";
import { Label } from "@watchalong/ui/components/ui/label";
import { ArrowRight, CircleAlert, MousePointer2, PenLine, Play } from "lucide-react";
import { type FormEvent, useState } from "react";
import { getItem, setItem } from "../lib/storage";
import { Shell } from "./Shell";

const NAME_KEY = "watchalong:name";

const ERROR_TEXT: Record<string, { title: string; body: string }> = {
  "room-not-found": {
    title: "This session isn't running",
    body: "The host may have ended it, or the link is incomplete. Ask them for a fresh invite.",
  },
  "bad-secret": {
    title: "This invite link is invalid",
    body: "Part of the link seems to be missing. Copy the whole link from the host and try again.",
  },
  "room-full": {
    title: "The room is full",
    body: "This session already has the maximum number of guests.",
  },
};

export function JoinScreen({
  errorCode,
  onJoin,
}: {
  errorCode?: string;
  onJoin: (name: string) => void;
}) {
  const [name, setName] = useState(() => getItem("local", NAME_KEY) ?? "");
  const error = errorCode
    ? (ERROR_TEXT[errorCode] ?? {
        title: "Couldn't join",
        body: `Something went wrong (${errorCode}).`,
      })
    : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
    if (!trimmed) return;
    setItem("local", NAME_KEY, trimmed);
    onJoin(trimmed);
  };

  return (
    <Shell>
      <Card className="w-full max-w-md border-border/60 bg-card/80 shadow-2xl shadow-black/40 backdrop-blur">
        <CardHeader className="space-y-1.5">
          <CardTitle className="text-2xl tracking-tight">You're invited to watch along</CardTitle>
          <CardDescription>
            Pick a name. The host will see it and let you in. No account or install needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {error && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>{error.title}</AlertTitle>
              <AlertDescription>{error.body}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="name">Your name</Label>
              <Input
                id="name"
                placeholder="e.g. Sam"
                autoComplete="nickname"
                maxLength={MAX_NAME_LENGTH}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11"
              />
            </div>
            <Button type="submit" size="lg" className="h-11 w-full" disabled={!name.trim()}>
              Ask to join
              <ArrowRight />
            </Button>
          </form>
          <ul className="grid grid-cols-3 gap-2 text-center text-xs text-muted-foreground">
            <Feature icon={<Play className="size-4" />} label="Watch live" />
            <Feature icon={<MousePointer2 className="size-4" />} label="Point together" />
            <Feature icon={<PenLine className="size-4" />} label="Draw on screen" />
          </ul>
        </CardContent>
      </Card>
    </Shell>
  );
}

function Feature({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <li className="flex flex-col items-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 px-2 py-3">
      <span className="text-primary">{icon}</span>
      {label}
    </li>
  );
}
