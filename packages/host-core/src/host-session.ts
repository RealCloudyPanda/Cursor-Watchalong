import {
  COMMAND_RATE_PER_SEC,
  CURSOR_RATE_PER_SEC,
  type GuestMessage,
  HOST_RECONNECT_GRACE_MS,
  type HostMessage,
  type IceServer,
  type MediaState,
  PARTICIPANT_COLORS,
  type Participant,
  parseWire,
  requiresControl,
  ServerMessage,
} from "@watchalong/protocol";
import { describeMediaAction } from "./activity";
import { GuestPeer, type PeerConnectionState } from "./guest-peer";
import { TokenBucket } from "./token-bucket";

export interface PendingGuest {
  guestId: string;
  name: string;
}

export interface HostGuest {
  id: string;
  name: string;
  color: string;
  canControl: boolean;
  connection: PeerConnectionState;
}

export interface ActivityEntry {
  id: number;
  at: number;
  by: string;
  name: string;
  color: string;
  text: string;
}

export type EndReason = "host-ended" | "server-lost" | "capture-ended" | "error";

export interface HostState {
  status: "connecting" | "live" | "reconnecting" | "ended";
  roomId?: string;
  inviteUrl?: string;
  hostName: string;
  hostColor: string;
  pending: PendingGuest[];
  guests: HostGuest[];
  activity: ActivityEntry[];
  controlForAll: boolean;
  endReason?: EndReason;
  error?: string;
}

export interface HostSessionOptions {
  wsUrl: string;
  publicOrigin: string;
  hostName: string;
  stream: MediaStream;
  /** A validated, permission-checked guest message that should act on the shared tab. */
  onGuestMessage: (guest: Participant, message: GuestMessage) => void;
  onStateChange: (state: HostState) => void;
  /** A guest left or was removed: the tab should drop their cursor and strokes. */
  onGuestGone?: (guestId: string) => void;
  createWebSocket?: (url: string) => WebSocket;
  createPeerConnection?: (config: RTCConfiguration) => RTCPeerConnection;
}

interface GuestRecord extends HostGuest {
  peer: GuestPeer;
  /** Server admission counter; a different value means the guest has a new connection. */
  seq: number;
  cursorBucket: TokenBucket;
  strokeBucket: TokenBucket;
  commandBucket: TokenBucket;
  /** Rejections are rate-limited too, so a spammer can't make us flood the channel. */
  rejectBucket: TokenBucket;
}

const MAX_ACTIVITY = 30;
const RECONNECT_DELAYS = [500, 1_000, 2_000, 4_000, 8_000];

/**
 * Everything the host does that is independent of Chrome extension APIs: the signaling socket,
 * one WebRTC connection per guest, the roster, permissions and message routing.
 * The extension's offscreen document and the e2e test harness both drive this class.
 */
export class HostSession {
  private ws: WebSocket | null = null;
  private iceServers: IceServer[] = [];
  private hostToken: string | null = null;
  private hostId: string | null = null;
  private guests = new Map<string, GuestRecord>();
  private colorByGuest = new Map<string, string>();
  private mediaState: MediaState | null = null;
  private viewport: { width: number; height: number } | null = null;
  private activitySeq = 0;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDeadline = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private deadlineTimer: ReturnType<typeof setTimeout> | null = null;
  /** True while the server knows us as this room's host (room-created / host-resumed). */
  private online = false;
  /** Per-guest control decisions, kept across reconnects; cleared by "everyone" toggles. */
  private controlOverrides = new Map<string, boolean>();
  private state: HostState;

  constructor(private options: HostSessionOptions) {
    this.state = {
      status: "connecting",
      hostName: options.hostName,
      hostColor: PARTICIPANT_COLORS[0],
      pending: [],
      guests: [],
      activity: [],
      controlForAll: false,
    };
  }

  get snapshot(): HostState {
    return this.state;
  }

  start(): void {
    this.connect();
    this.pingTimer = setInterval(() => this.sendServer({ type: "ping" }), 20_000);
  }

  // ── Host actions ──────────────────────────────────────────────

  admit(guestId: string): boolean {
    if (!this.requireOnline()) return false;
    this.removePending(guestId);
    this.sendServer({ type: "admit", guestId });
    return true;
  }

  deny(guestId: string): boolean {
    if (!this.requireOnline()) return false;
    this.removePending(guestId);
    this.sendServer({ type: "deny", guestId });
    return true;
  }

  kick(guestId: string): boolean {
    if (!this.requireOnline()) return false;
    this.sendServer({ type: "kick", guestId });
    this.controlOverrides.delete(guestId);
    this.dropGuest(guestId);
    return true;
  }

  setControl(guestId: string, canControl: boolean) {
    this.controlOverrides.set(guestId, canControl);
    const guest = this.guests.get(guestId);
    if (!guest || guest.canControl === canControl) return;
    guest.canControl = canControl;
    this.publishRoster();
  }

  setControlForAll(canControl: boolean) {
    this.controlOverrides.clear();
    for (const guest of this.guests.values()) guest.canControl = canControl;
    this.setState({ controlForAll: canControl });
    this.publishRoster();
  }

  updateMediaState(state: MediaState) {
    this.mediaState = state;
    this.broadcast({ type: "media-state", state });
  }

  updateViewport(viewport: { width: number; height: number }) {
    const w = Math.round(viewport.width);
    const h = Math.round(viewport.height);
    if (w < 1 || h < 1) return;
    if (this.viewport?.width === w && this.viewport.height === h) return;
    this.viewport = { width: w, height: h };
    this.broadcast({ type: "tab-info", viewport: this.viewport });
  }

  end(reason: EndReason = "host-ended") {
    if (this.state.status === "ended") return;
    this.clearTimers();
    if (reason !== "server-lost") this.sendServer({ type: "end-room" });
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null;
      ws.onmessage = null;
      // Let the end-room frame flush before closing.
      setTimeout(() => ws.close(), 100);
    }
    for (const id of [...this.guests.keys()]) this.dropGuest(id, false);
    this.setState({ status: "ended", endReason: reason, pending: [], guests: [] });
  }

  // ── Signaling socket ─────────────────────────────────────────

  private connect() {
    const create = this.options.createWebSocket ?? ((url) => new WebSocket(url));
    const ws = create(this.options.wsUrl);
    this.ws = ws;

    ws.onopen = () => {
      if (this.hostToken && this.state.roomId) {
        this.sendServer({
          type: "resume-host",
          roomId: this.state.roomId,
          hostToken: this.hostToken,
        });
      } else {
        this.sendServer({ type: "create-room", name: this.options.hostName });
      }
    };
    ws.onmessage = (event) => {
      const parsed = parseWire(ServerMessage, String(event.data));
      if (parsed.ok) this.handleServer(parsed.value);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.online = false;
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    if (this.state.status === "ended") return;
    if (!this.hostToken) {
      // Never got a room; nothing to resume.
      this.setState({ error: "Couldn't reach the Watchalong server." });
      this.end("server-lost");
      return;
    }
    const now = Date.now();
    if (this.reconnectAttempt === 0) {
      this.reconnectDeadline = now + HOST_RECONNECT_GRACE_MS - 2_000;
      // Independent deadline: a stalled handshake must not keep us "reconnecting" forever.
      if (this.deadlineTimer) clearTimeout(this.deadlineTimer);
      this.deadlineTimer = setTimeout(() => {
        this.deadlineTimer = null;
        if (!this.online && this.state.status !== "ended") {
          this.setState({ error: "Lost connection to the Watchalong server." });
          this.end("server-lost");
        }
      }, HOST_RECONNECT_GRACE_MS - 2_000);
    }
    if (now >= this.reconnectDeadline) {
      this.setState({ error: "Lost connection to the Watchalong server." });
      this.end("server-lost");
      return;
    }
    this.setState({ status: "reconnecting" });
    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)];
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private handleServer(message: ServerMessage) {
    switch (message.type) {
      case "room-created":
        this.online = true;
        this.hostToken = message.hostToken;
        this.hostId = message.hostId;
        this.iceServers = message.iceServers;
        this.setState({
          status: "live",
          roomId: message.roomId,
          inviteUrl: `${this.options.publicOrigin}/r/${message.roomId}#k=${message.secret}`,
        });
        break;
      case "host-resumed":
        this.online = true;
        this.reconnectAttempt = 0;
        if (this.deadlineTimer) clearTimeout(this.deadlineTimer);
        this.deadlineTimer = null;
        this.iceServers = message.iceServers;
        this.reconcile(message.guests, message.pending);
        this.setState({ status: "live", error: undefined });
        break;
      case "join-request":
        if (!this.state.pending.some((p) => p.guestId === message.guestId)) {
          this.setState({
            pending: [...this.state.pending, { guestId: message.guestId, name: message.name }],
          });
        }
        break;
      case "guest-joined":
        this.addGuest(message.guestId, message.name, message.seq);
        break;
      case "guest-left":
        this.removePending(message.guestId);
        this.dropGuest(message.guestId);
        break;
      case "signal": {
        const guest = this.guests.get(message.from);
        guest?.peer.handleSignal(message.payload).catch(() => {});
        break;
      }
      case "room-ended":
        this.end("server-lost");
        break;
      case "error":
        if (message.code === "room-not-found" || message.code === "not-host") {
          if (this.state.status === "reconnecting") {
            this.setState({ error: "The session expired while reconnecting." });
            this.end("server-lost");
            return;
          }
        }
        if (message.code === "rate-limited" && !this.hostToken) {
          this.setState({ error: "Too many sessions started. Try again in a minute." });
          this.end("error");
          return;
        }
        if (message.code !== "unknown-peer")
          this.setState({ error: message.message ?? message.code });
        break;
      default:
        break;
    }
  }

  private sendServer(message: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }

  // ── Guests ───────────────────────────────────────────────────

  private addGuest(guestId: string, name: string, seq: number) {
    this.removePending(guestId);
    const existing = this.guests.get(guestId);
    // A rejoining guest keeps their color and control permission but gets a fresh connection.
    const canControl = this.controlOverrides.get(guestId) ?? this.state.controlForAll;
    if (existing) this.dropGuest(guestId, false);

    const color = this.colorFor(guestId);
    const peer = new GuestPeer({
      guestId,
      iceServers: this.iceServers,
      stream: this.options.stream,
      createPeerConnection: this.options.createPeerConnection,
      sendSignal: (payload) => this.sendServer({ type: "signal", to: guestId, payload }),
      canSignal: () => this.online,
      onMessage: (msg) => this.handleGuestMessage(guestId, msg),
      onConnectionState: (connection) => {
        const g = this.guests.get(guestId);
        if (!g || g.peer !== peer || connection === "closed") return;
        g.connection = connection;
        this.publishGuests();
      },
      onControlOpen: () => this.welcome(guestId),
    });
    const record: GuestRecord = {
      id: guestId,
      name,
      color,
      canControl,
      connection: "connecting",
      peer,
      seq,
      cursorBucket: new TokenBucket(CURSOR_RATE_PER_SEC, CURSOR_RATE_PER_SEC),
      strokeBucket: new TokenBucket(CURSOR_RATE_PER_SEC * 2, CURSOR_RATE_PER_SEC * 2),
      commandBucket: new TokenBucket(COMMAND_RATE_PER_SEC, COMMAND_RATE_PER_SEC),
      rejectBucket: new TokenBucket(2, 4),
    };
    this.guests.set(guestId, record);
    this.publishRoster();
    peer.start().catch(() => {
      record.connection = "failed";
      this.publishGuests();
    });
  }

  private dropGuest(guestId: string, publish = true) {
    const guest = this.guests.get(guestId);
    if (!guest) return;
    this.guests.delete(guestId);
    guest.peer.close();
    this.options.onGuestGone?.(guestId);
    if (publish) this.publishRoster();
  }

  private removePending(guestId: string) {
    if (this.state.pending.some((p) => p.guestId === guestId)) {
      this.setState({ pending: this.state.pending.filter((p) => p.guestId !== guestId) });
    }
  }

  private colorFor(guestId: string): string {
    const used = new Set([...this.guests.values()].map((g) => g.color));
    const known = this.colorByGuest.get(guestId);
    if (known && !used.has(known)) return known;
    const guestColors = PARTICIPANT_COLORS.slice(1);
    const color =
      guestColors.find((c) => !used.has(c)) ??
      guestColors[this.colorByGuest.size % guestColors.length] ??
      PARTICIPANT_COLORS[1];
    this.colorByGuest.set(guestId, color);
    return color;
  }

  private welcome(guestId: string) {
    const guest = this.guests.get(guestId);
    if (!guest) return;
    guest.peer.send({ type: "welcome", you: guestId });
    guest.peer.send({ type: "roster", participants: this.participants() });
    if (this.viewport) guest.peer.send({ type: "tab-info", viewport: this.viewport });
    if (this.mediaState) guest.peer.send({ type: "media-state", state: this.mediaState });
  }

  private handleGuestMessage(guestId: string, message: GuestMessage) {
    const guest = this.guests.get(guestId);
    if (!guest) return;

    const isPointing =
      message.type === "cursor" ||
      message.type === "cursor-leave" ||
      message.type === "stroke-point";
    const bucket =
      message.type === "stroke-point"
        ? guest.strokeBucket
        : isPointing
          ? guest.cursorBucket
          : guest.commandBucket;
    if (!bucket.take()) {
      if (!isPointing && guest.rejectBucket.take()) {
        guest.peer.send({ type: "command-rejected", reason: "rate-limited" });
      }
      return;
    }
    if (requiresControl(message) && !guest.canControl) {
      if (guest.rejectBucket.take()) {
        guest.peer.send({ type: "command-rejected", reason: "no-control" });
      }
      return;
    }

    // Describe against the state *before* the tab applies the command.
    const activity =
      message.type === "media" ? describeMediaAction(message, this.mediaState) : null;
    this.options.onGuestMessage(this.toParticipant(guest), message);
    if (activity) this.recordActivity(guest, activity);
  }

  private recordActivity(guest: GuestRecord, text: string) {
    const entry: ActivityEntry = {
      id: ++this.activitySeq,
      at: Date.now(),
      by: guest.id,
      name: guest.name,
      color: guest.color,
      text,
    };
    this.setState({ activity: [entry, ...this.state.activity].slice(0, MAX_ACTIVITY) });
    for (const other of this.guests.values()) {
      if (other.id !== guest.id) other.peer.send({ type: "activity", by: guest.id, text });
    }
  }

  // ── Publishing ───────────────────────────────────────────────

  private participants(): Participant[] {
    const host: Participant = {
      id: this.hostId ?? "host000",
      name: this.options.hostName,
      color: PARTICIPANT_COLORS[0],
      role: "host",
      canControl: true,
    };
    return [host, ...[...this.guests.values()].map((g) => this.toParticipant(g))];
  }

  private toParticipant(guest: GuestRecord): Participant {
    return {
      id: guest.id,
      name: guest.name,
      color: guest.color,
      role: "guest",
      canControl: guest.canControl,
    };
  }

  private publishRoster() {
    this.broadcast({ type: "roster", participants: this.participants() });
    this.publishGuests();
  }

  private publishGuests() {
    this.setState({
      guests: [...this.guests.values()].map(({ id, name, color, canControl, connection }) => ({
        id,
        name,
        color,
        canControl,
        connection,
      })),
    });
  }

  private broadcast(message: HostMessage) {
    for (const guest of this.guests.values()) guest.peer.send(message);
  }

  private setState(patch: Partial<HostState>) {
    this.state = { ...this.state, ...patch };
    this.options.onStateChange(this.state);
  }

  private clearTimers() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.deadlineTimer) clearTimeout(this.deadlineTimer);
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.deadlineTimer = null;
  }

  private requireOnline(): boolean {
    if (this.online) return true;
    this.setState({ error: "Reconnecting to the server. Try again in a moment." });
    return false;
  }

  /** After resuming, make local guests and requests match the server's view exactly. */
  private reconcile(guests: (PendingGuest & { seq: number })[], pending: PendingGuest[]) {
    const serverIds = new Set(guests.map((g) => g.guestId));
    for (const id of [...this.guests.keys()]) {
      if (!serverIds.has(id)) this.dropGuest(id);
    }
    for (const g of guests) {
      const local = this.guests.get(g.guestId);
      // Rejoined while we were away → its old connection is gone; build a new one.
      if (!local || local.seq !== g.seq) this.addGuest(g.guestId, g.name, g.seq);
      else local.peer.resync();
    }
    this.setState({ pending });
  }

  /** Roster as the tab overlay needs it (names and colors for cursors). */
  get roster(): Participant[] {
    return this.participants();
  }
}
