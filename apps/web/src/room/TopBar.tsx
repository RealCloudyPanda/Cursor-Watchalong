import type { Participant } from "@watchalong/protocol";
import { Brand } from "@watchalong/ui/components/brand";
import { ParticipantAvatar } from "@watchalong/ui/components/participant-avatar";
import { StatusDot } from "@watchalong/ui/components/status-dot";
import { Badge } from "@watchalong/ui/components/ui/badge";
import { Button } from "@watchalong/ui/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@watchalong/ui/components/ui/popover";
import { Eye, LogOut, MousePointerClick } from "lucide-react";
import type { GuestState } from "../session/guest-session";

export function TopBar({ state, onLeave }: { state: GuestState; onLeave: () => void }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/60 bg-background/90 px-3 backdrop-blur sm:px-4">
      <Brand compact className="hidden sm:flex" />
      <ConnectionBadge state={state} />
      <div className="ml-auto flex items-center gap-2">
        {state.me && <ControlBadge canControl={state.me.canControl} />}
        <ParticipantsPopover roster={state.roster} meId={state.guestId} />
        <Button
          variant="ghost"
          size="sm"
          onClick={onLeave}
          className="text-muted-foreground"
          aria-label="Leave session"
        >
          <LogOut />
          <span className="hidden sm:inline">Leave</span>
        </Button>
      </div>
    </header>
  );
}

function ConnectionBadge({ state }: { state: GuestState }) {
  if (state.phase === "reconnecting" || state.peer === "reconnecting") {
    return (
      <Badge variant="outline" className="gap-1.5 border-warning/40 text-warning">
        <StatusDot tone="warn" pulse /> Reconnecting
      </Badge>
    );
  }
  if (state.hostAway) {
    return (
      <Badge variant="outline" className="gap-1.5 border-warning/40 text-warning">
        <StatusDot tone="warn" pulse /> Host reconnecting
      </Badge>
    );
  }
  if (state.peer === "failed") {
    return (
      <Badge variant="outline" className="gap-1.5 border-destructive/40 text-destructive">
        <StatusDot tone="error" /> Connection failed
      </Badge>
    );
  }
  if (state.phase === "live" && state.peer === "connected") {
    return (
      <Badge variant="outline" className="gap-1.5 border-success/30 text-success">
        <StatusDot tone="live" pulse /> Live
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1.5 text-muted-foreground">
      <StatusDot tone="idle" /> Connecting
    </Badge>
  );
}

function ControlBadge({ canControl }: { canControl: boolean }) {
  return canControl ? (
    <Badge className="hidden gap-1.5 bg-primary/15 text-primary sm:inline-flex" variant="secondary">
      <MousePointerClick className="size-3.5" /> You can control
    </Badge>
  ) : (
    <Badge className="hidden gap-1.5 text-muted-foreground sm:inline-flex" variant="secondary">
      <Eye className="size-3.5" /> Point & draw
    </Badge>
  );
}

function ParticipantsPopover({ roster, meId }: { roster: Participant[]; meId?: string }) {
  const shown = roster.slice(0, 4);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="h-10 gap-2 px-2"
          aria-label={`${roster.length} people in the room`}
        >
          <span className="flex -space-x-2">
            {shown.map((p) => (
              <ParticipantAvatar key={p.id} name={p.name} color={p.color} size="sm" />
            ))}
          </span>
          <span className="text-sm text-muted-foreground tabular-nums">{roster.length}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <p className="px-2 pt-1 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          In the room
        </p>
        <ul className="space-y-0.5">
          {roster.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-md px-2 py-1.5">
              <ParticipantAvatar
                name={p.name}
                color={p.color}
                isHost={p.role === "host"}
                size="sm"
              />
              <span className="min-w-0 flex-1 truncate text-sm">
                {p.name}
                {p.id === meId && <span className="text-muted-foreground"> (you)</span>}
              </span>
              <span className="text-xs text-muted-foreground">
                {p.role === "host" ? "Host" : p.canControl ? "Can control" : "Point & draw"}
              </span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
