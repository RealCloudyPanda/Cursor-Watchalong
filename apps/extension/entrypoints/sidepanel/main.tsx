import type { ActivityEntry, HostGuest, HostState, PendingGuest } from "@watchalong/host-core";
import { MAX_GUESTS } from "@watchalong/protocol";
import { Brand } from "@watchalong/ui/components/brand";
import { ParticipantAvatar } from "@watchalong/ui/components/participant-avatar";
import { StatusDot } from "@watchalong/ui/components/status-dot";
import { Alert, AlertDescription, AlertTitle } from "@watchalong/ui/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@watchalong/ui/components/ui/alert-dialog";
import { Badge } from "@watchalong/ui/components/ui/badge";
import { Button } from "@watchalong/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@watchalong/ui/components/ui/dropdown-menu";
import { Input } from "@watchalong/ui/components/ui/input";
import { Kbd } from "@watchalong/ui/components/ui/kbd";
import { Label } from "@watchalong/ui/components/ui/label";
import { Separator } from "@watchalong/ui/components/ui/separator";
import { Toaster } from "@watchalong/ui/components/ui/sonner";
import { Switch } from "@watchalong/ui/components/ui/switch";
import { Toggle } from "@watchalong/ui/components/ui/toggle";
import { TooltipProvider } from "@watchalong/ui/components/ui/tooltip";
import {
  Check,
  Copy,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  PenLine,
  Radio,
  ShieldAlert,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import { useSession } from "../../components/useSession";
import { type ExtMessage, type SessionState, sendExt } from "../../lib/messages";
import "../../lib/app.css";

const toOffscreen = (message: ExtMessage) => sendExt(message);

function SidePanel() {
  const session = useSession();
  const host = session.host;

  if (session.status === "starting" || (session.status === "live" && !host?.inviteUrl)) {
    return (
      <Frame>
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Starting your session…</p>
        </div>
      </Frame>
    );
  }

  if (session.status !== "live" || !host) {
    return (
      <Frame>
        <NotSharing session={session} />
      </Frame>
    );
  }

  return (
    <Frame status={<LiveBadge host={host} />}>
      <div className="space-y-5">
        <SharedTab session={session} />
        {session.drmWarning && (
          <Alert className="border-warning/40 text-warning [&>svg]:text-warning">
            <ShieldAlert />
            <AlertTitle>Video may appear black to guests</AlertTitle>
            <AlertDescription className="text-warning/80">
              This site protects its video, so tab capture usually shows a black picture.
            </AlertDescription>
          </Alert>
        )}
        {host.error && host.status === "reconnecting" && (
          <Alert className="border-warning/40">
            <Loader2 className="animate-spin" />
            <AlertDescription>Reconnecting to the server…</AlertDescription>
          </Alert>
        )}
        <InviteCard url={host.inviteUrl ?? ""} />
        {host.pending.length > 0 && (
          <JoinRequests pending={host.pending} full={host.guests.length >= MAX_GUESTS} />
        )}
        <People host={host} />
        <DrawControl drawing={session.drawing ?? false} />
        <Activity entries={host.activity} />
        <Separator />
        <EndSession />
      </div>
    </Frame>
  );
}

function Frame({ children, status }: { children: ReactNode; status?: ReactNode }) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="min-h-svh bg-background">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border/60 bg-background/90 px-4 py-3 backdrop-blur">
          <Brand compact />
          {status}
        </header>
        <main className="p-4">{children}</main>
      </div>
      <Toaster position="bottom-center" />
    </TooltipProvider>
  );
}

function LiveBadge({ host }: { host: HostState }) {
  if (host.status === "reconnecting") {
    return (
      <Badge variant="outline" className="gap-1.5 border-warning/40 text-warning">
        <StatusDot tone="warn" pulse /> Reconnecting
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1.5 border-success/30 text-success">
      <StatusDot tone="live" pulse /> Live
    </Badge>
  );
}

function NotSharing({ session }: { session: SessionState }) {
  const ended = session.status === "ended";
  return (
    <div className="space-y-5 py-6">
      <div className="space-y-2 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Radio className="size-5" />
        </span>
        <h1 className="text-lg font-semibold">{ended ? "Session ended" : "Not sharing yet"}</h1>
        <p className="text-sm text-muted-foreground">
          Go to the tab you want to share, click the Cursor Watchalong icon in the toolbar, then
          choose <span className="font-medium text-foreground">Start sharing this tab</span>.
        </p>
      </div>
      {session.error && (
        <Alert variant="destructive">
          <ShieldAlert />
          <AlertDescription>{session.error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function SharedTab({ session }: { session: SessionState }) {
  return (
    <button
      type="button"
      onClick={() => sendExt({ target: "background", type: "focus-shared-tab" })}
      className="flex w-full items-center gap-3 rounded-lg border border-border/60 bg-card px-3 py-2.5 text-left transition-colors hover:bg-accent"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
        <Radio className="size-4 text-success" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {session.tabTitle ?? "Shared tab"}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{session.tabHost}</span>
      </span>
      <ExternalLink className="size-4 text-muted-foreground" />
    </button>
  );
}

function InviteCard({ url }: { url: string }) {
  const copy = async () => {
    await navigator.clipboard.writeText(url);
    toast.success("Invite link copied", {
      description: "Send it to the people you want to invite.",
    });
  };
  return (
    <section className="space-y-2">
      <Label htmlFor="invite">Invite link</Label>
      <div className="flex gap-2">
        <Input
          id="invite"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="font-mono text-xs"
        />
        <Button onClick={copy} className="shrink-0">
          <Copy />
          Copy
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Anyone with the link can ask to join. You approve each person.
      </p>
    </section>
  );
}

function JoinRequests({ pending, full }: { pending: PendingGuest[]; full: boolean }) {
  return (
    <section className="space-y-2 rounded-xl border border-primary/40 bg-primary/10 p-3">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <StatusDot tone="warn" pulse />
        {pending.length === 1 ? "1 person wants to join" : `${pending.length} people want to join`}
      </h2>
      {full && (
        <p className="text-xs text-muted-foreground">
          The room is full ({MAX_GUESTS} guests). Remove someone to admit more.
        </p>
      )}
      <ul className="space-y-1.5">
        {pending.map((p) => (
          <li
            key={p.guestId}
            className="flex items-center gap-2 rounded-lg bg-background/60 px-2.5 py-2"
          >
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
            <Button
              size="sm"
              disabled={full}
              onClick={() =>
                toOffscreen({ target: "offscreen", type: "admit", guestId: p.guestId })
              }
            >
              <Check />
              Admit
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              aria-label={`Deny ${p.name}`}
              onClick={() => toOffscreen({ target: "offscreen", type: "deny", guestId: p.guestId })}
            >
              <X />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function People({ host }: { host: HostState }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Users className="size-4 text-muted-foreground" />
          In the room
          <span className="text-muted-foreground tabular-nums">
            {host.guests.length + 1}/{MAX_GUESTS + 1}
          </span>
        </h2>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Everyone can control
          <Switch
            checked={host.controlForAll}
            onCheckedChange={(v) =>
              toOffscreen({ target: "offscreen", type: "set-control-all", canControl: v })
            }
            aria-label="Let everyone control the tab"
          />
        </label>
      </div>
      <ul className="space-y-1">
        <li className="flex items-center gap-3 rounded-lg px-2 py-1.5">
          <ParticipantAvatar name={host.hostName} color={host.hostColor} isHost size="sm" />
          <span className="flex-1 truncate text-sm">
            {host.hostName} <span className="text-muted-foreground">(you)</span>
          </span>
          <span className="text-xs text-muted-foreground">Host</span>
        </li>
        {host.guests.map((g) => (
          <GuestRow key={g.id} guest={g} />
        ))}
      </ul>
      {host.guests.length === 0 && (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          No guests yet. Share the invite link to get started.
        </p>
      )}
    </section>
  );
}

const CONNECTION_LABEL: Record<HostGuest["connection"], string> = {
  connecting: "Connecting",
  connected: "Connected",
  reconnecting: "Reconnecting",
  failed: "Connection failed",
  closed: "Left",
};

function GuestRow({ guest }: { guest: HostGuest }) {
  const tone =
    guest.connection === "connected" ? "live" : guest.connection === "failed" ? "error" : "warn";
  return (
    <li className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-accent/50">
      <ParticipantAvatar name={guest.name} color={guest.color} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{guest.name}</span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <StatusDot tone={tone} className="size-1.5" />
          {CONNECTION_LABEL[guest.connection]}
        </span>
      </span>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        Control
        <Switch
          checked={guest.canControl}
          onCheckedChange={(v) =>
            toOffscreen({
              target: "offscreen",
              type: "set-control",
              guestId: guest.id,
              canControl: v,
            })
          }
          aria-label={`Let ${guest.name} control the tab`}
        />
      </label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label={`More for ${guest.name}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => toOffscreen({ target: "offscreen", type: "kick", guestId: guest.id })}
          >
            <UserMinus />
            Remove from session
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

function DrawControl({ drawing }: { drawing: boolean }) {
  return (
    <section className="flex items-center gap-3 rounded-lg border border-border/60 bg-card px-3 py-2.5">
      <Toggle
        pressed={drawing}
        onPressedChange={(v) =>
          toOffscreen({ target: "offscreen", type: "set-drawing", drawing: v })
        }
        variant="outline"
        aria-label="Draw on the shared tab"
        className="data-[state=on]:border-primary data-[state=on]:bg-primary/15 data-[state=on]:text-primary"
      >
        <PenLine />
        Draw
      </Toggle>
      <p className="text-xs text-muted-foreground">
        Or hold <Kbd>Alt</Kbd> in the tab to draw. Marks fade after a few seconds.
      </p>
    </section>
  );
}

function Activity({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium">Activity</h2>
      <ul className="space-y-1.5">
        {entries.slice(0, 8).map((e) => (
          <li key={e.id} className="flex items-center gap-2 text-xs">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: e.color }} />
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium">{e.name}</span>{" "}
              <span className="text-muted-foreground">{e.text}</span>
            </span>
            <time className="text-muted-foreground tabular-nums">
              {new Date(e.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </time>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EndSession() {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" className="w-full">
          End session
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>End the session for everyone?</AlertDialogTitle>
          <AlertDialogDescription>
            Guests will stop seeing your tab right away. You can start a new session any time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep sharing</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={() => sendExt({ target: "background", type: "stop-sharing" })}
          >
            End session
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<SidePanel />);
