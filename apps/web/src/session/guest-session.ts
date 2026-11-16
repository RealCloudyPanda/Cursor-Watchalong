import {
  CONTROL_CHANNEL,
  CURSOR_CHANNEL,
  type GuestMessage,
  HostMessage,
  type IceServer,
  type MediaState,
  type Participant,
  parseWire,
  preferStereoOpus,
  REJOIN_TOKEN_TTL_MS,
  ServerMessage,
} from "@watchalong/protocol";
import { getItem, removeItem, setItem } from "../lib/storage";

export type GuestPhase =
  | "idle"
  | "connecting"
  | "waiting"
  | "joining"
  | "live"
  | "reconnecting"
  | "ended"
  | "error";

export type EndReason = "denied" | "kicked" | "room-ended" | "lost" | "left";

export type PeerStatus = "connecting" | "connected" | "reconnecting" | "failed";

export interface GuestState {
  phase: GuestPhase;
  endReason?: EndReason;
  errorCode?: string;
  hostAway: boolean;
  guestId?: string;
  stream: MediaStream | null;
  peer: PeerStatus;
  roster: Participant[];
  me?: Participant;
  mediaState: MediaState | null;
  /** When mediaState arrived, for local clock extrapolation. */
  mediaAt: number;
  viewport: { width: number; height: number } | null;
}

export type GuestEvent =
  | { type: "activity"; by: Participant | undefined; text: string }
  | { type: "command-rejected"; reason: "no-control" | "rate-limited" };

const rejoinKey = (roomId: string) => `watchalong:rejoin:${roomId}`;
const RECONNECT_DELAYS = [500, 1_000, 2_000, 4_000, 8_000, 15_000];

/**
 * Guest side of a room: signaling WebSocket, the single RTCPeerConnection to the host,
 * and the DataChannels used to send cursors, strokes and commands.
 * Framework-free; React subscribes through `subscribe`/`getSnapshot`.
 */
export class GuestSession {
  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private control: RTCDataChannel | null = null;
  private cursor: RTCDataChannel | null = null;
  private iceServers: IceServer[] = [];
  private hostId: string | null = null;
  private name = "";
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDeadline = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;
  private listeners = new Set<() => void>();
  private eventListeners = new Set<(event: GuestEvent) => void>();
  private state: GuestState = {
    phase: "idle",
    hostAway: false,
    stream: null,
    peer: "connecting",
    roster: [],
    mediaState: null,
    mediaAt: 0,
    viewport: null,
  };

  constructor(
    private roomId: string,
    private secret: string,
    private wsUrl: string,
  ) {}

  // ── React bindings ───────────────────────────────────────────

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.state;

  onEvent(listener: (event: GuestEvent) => void) {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  // ── Public API ───────────────────────────────────────────────

  /** Undo a previous dispose (React StrictMode runs effect cleanup once before re-running). */
  activate() {
    this.disposed = false;
  }

  join(name: string) {
    this.disposed = false;
    this.name = name;
    this.reconnectAttempt = 0;
    this.setState({ phase: "connecting", errorCode: undefined, endReason: undefined });
    this.openSocket();
    this.pingTimer ??= setInterval(() => this.sendServer({ type: "ping" }), 20_000);
  }

  send(message: GuestMessage): boolean {
    const channel =
      message.type === "cursor" || message.type === "cursor-leave" ? this.cursor : this.control;
    if (channel?.readyState !== "open") return false;
    channel.send(JSON.stringify(message));
    return true;
  }

  leave() {
    removeItem("session", rejoinKey(this.roomId));
    this.dispose();
    this.setState({ phase: "ended", endReason: "left" });
  }

  dispose() {
    this.disposed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.reconnectTimer = null;
    this.pingTimer = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
    this.closePeer();
  }

  // ── Signaling ────────────────────────────────────────────────

  private openSocket() {
    const ws = new WebSocket(this.wsUrl);
    this.ws = ws;
    ws.onopen = () => {
      const rejoinToken = getItem("session", rejoinKey(this.roomId)) ?? undefined;
      this.sendServer({
        type: "join",
        roomId: this.roomId,
        secret: this.secret,
        name: this.name,
        ...(rejoinToken ? { rejoinToken } : {}),
      });
    };
    ws.onmessage = (event) => {
      const parsed = parseWire(ServerMessage, String(event.data));
      if (parsed.ok) this.handleServer(parsed.value);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.handleSocketLost();
    };
  }

  private handleSocketLost() {
    if (this.disposed) return;
    const { phase } = this.state;
    if (phase === "ended" || phase === "error") return;
    // Only an admitted guest can rejoin silently; otherwise the request is simply gone.
    if (phase !== "live" && phase !== "joining" && phase !== "reconnecting") {
      this.dispose();
      this.setState({ phase: "ended", endReason: "lost" });
      return;
    }
    const now = Date.now();
    if (this.reconnectAttempt === 0) this.reconnectDeadline = now + REJOIN_TOKEN_TTL_MS - 10_000;
    if (now >= this.reconnectDeadline) {
      this.dispose();
      this.setState({ phase: "ended", endReason: "lost" });
      return;
    }
    // The P2P stream keeps playing while the signaling socket reconnects.
    this.setState({ phase: "reconnecting" });
    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)];
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.disposed) this.openSocket();
    }, delay);
  }

  private handleServer(message: ServerMessage) {
    switch (message.type) {
      case "waiting-for-host":
        this.setState({ phase: "waiting", guestId: message.guestId });
        break;
      case "admitted":
        this.reconnectAttempt = 0;
        setItem("session", rejoinKey(this.roomId), message.rejoinToken);
        this.iceServers = message.iceServers;
        this.hostId = message.hostId;
        this.createPeer();
        this.setState({
          phase: this.state.stream ? "live" : "joining",
          guestId: message.guestId,
          hostAway: false,
        });
        break;
      case "host-away":
        this.setState({ hostAway: true });
        break;
      case "host-back":
        this.setState({ hostAway: false });
        break;
      case "signal":
        if (message.from === this.hostId) this.handleSignal(message.payload).catch(() => {});
        break;
      case "denied":
      case "kicked":
      case "room-ended":
        removeItem("session", rejoinKey(this.roomId));
        this.dispose();
        this.setState({
          phase: "ended",
          endReason: message.type === "room-ended" ? "room-ended" : message.type,
        });
        break;
      case "error":
        if (this.state.phase === "reconnecting" && message.code === "room-not-found") {
          removeItem("session", rejoinKey(this.roomId));
          this.dispose();
          this.setState({ phase: "ended", endReason: "room-ended" });
          return;
        }
        // Transient: e.g. signaling while the host is reconnecting. Not fatal.
        if (message.code === "rate-limited" || message.code === "unknown-peer") return;
        this.dispose();
        this.setState({ phase: "error", errorCode: message.code });
        break;
      default:
        break;
    }
  }

  private sendServer(message: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }

  // ── WebRTC ───────────────────────────────────────────────────

  private createPeer() {
    this.closePeer();
    const pc = new RTCPeerConnection({ iceServers: this.iceServers as RTCIceServer[] });
    this.pc = pc;
    this.pendingCandidates = [];

    pc.onicecandidate = (event) => {
      if (this.pc !== pc || !this.hostId) return;
      this.sendServer({
        type: "signal",
        to: this.hostId,
        payload: { candidate: event.candidate ? event.candidate.toJSON() : null },
      });
    };
    pc.ontrack = (event) => {
      if (this.pc !== pc) return;
      const stream = event.streams[0] ?? this.state.stream ?? new MediaStream();
      if (!event.streams[0] && !stream.getTracks().includes(event.track)) {
        stream.addTrack(event.track);
      }
      this.setState({ stream, phase: this.state.phase === "joining" ? "live" : this.state.phase });
    };
    pc.ondatachannel = (event) => {
      if (this.pc !== pc) return;
      const channel = event.channel;
      if (channel.label === CONTROL_CHANNEL) this.control = channel;
      else if (channel.label === CURSOR_CHANNEL) this.cursor = channel;
      else return;
      channel.onmessage = (e) => {
        if (typeof e.data !== "string") return;
        const parsed = parseWire(HostMessage, e.data);
        if (parsed.ok) this.handleHost(parsed.value);
      };
    };
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc) return;
      const s = pc.connectionState;
      const peer: PeerStatus =
        s === "connected"
          ? "connected"
          : s === "failed"
            ? "failed"
            : s === "disconnected"
              ? "reconnecting"
              : "connecting";
      this.setState({ peer });
    };
  }

  private closePeer() {
    const pc = this.pc;
    this.pc = null;
    this.control = null;
    this.cursor = null;
    if (pc) {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.ondatachannel = null;
      pc.onconnectionstatechange = null;
      pc.close();
    }
  }

  private async handleSignal(
    payload: { description: RTCSessionDescriptionInit } | { candidate: RTCIceCandidateInit | null },
  ) {
    const pc = this.pc;
    if (!pc || !this.hostId) return;
    if ("description" in payload) {
      if (payload.description.type !== "offer") return;
      await pc.setRemoteDescription(payload.description);
      const answer = await pc.createAnswer();
      if (this.pc !== pc) return;
      await pc.setLocalDescription({
        type: "answer",
        sdp: preferStereoOpus(answer.sdp ?? ""),
      });
      const local = pc.localDescription;
      if (local) {
        this.sendServer({
          type: "signal",
          to: this.hostId,
          payload: { description: { type: local.type, sdp: local.sdp } },
        });
      }
      const queued = this.pendingCandidates;
      this.pendingCandidates = [];
      for (const c of queued) await pc.addIceCandidate(c).catch(() => {});
      return;
    }
    if (!payload.candidate) return;
    if (!pc.remoteDescription) {
      this.pendingCandidates.push(payload.candidate);
      return;
    }
    await pc.addIceCandidate(payload.candidate).catch(() => {});
  }

  private handleHost(message: HostMessage) {
    switch (message.type) {
      case "welcome":
        this.setState({ guestId: message.you });
        break;
      case "roster": {
        const me = message.participants.find((p) => p.id === this.state.guestId);
        this.setState({ roster: message.participants, me });
        break;
      }
      case "media-state":
        this.setState({ mediaState: message.state, mediaAt: Date.now() });
        break;
      case "tab-info":
        this.setState({ viewport: message.viewport });
        break;
      case "activity":
        this.emit({
          type: "activity",
          by: this.state.roster.find((p) => p.id === message.by),
          text: message.text,
        });
        break;
      case "command-rejected":
        this.emit({ type: "command-rejected", reason: message.reason });
        break;
    }
  }

  // ── State ────────────────────────────────────────────────────

  private setState(patch: Partial<GuestState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  private emit(event: GuestEvent) {
    for (const l of this.eventListeners) l(event);
  }
}
