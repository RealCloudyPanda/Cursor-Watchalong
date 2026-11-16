import {
  CONTROL_CHANNEL,
  CURSOR_CHANNEL,
  GuestMessage,
  type HostMessage,
  type IceServer,
  parseWire,
} from "@watchalong/protocol";

export type PeerConnectionState = "connecting" | "connected" | "reconnecting" | "failed" | "closed";

type SignalPayload =
  | { description: RTCSessionDescriptionInit }
  | { candidate: RTCIceCandidateInit | null };

export interface GuestPeerOptions {
  guestId: string;
  iceServers: IceServer[];
  stream: MediaStream;
  sendSignal: (payload: SignalPayload) => void;
  /** False while the host's signaling socket is reconnecting; negotiation waits for it. */
  canSignal?: () => boolean;
  onMessage: (message: GuestMessage) => void;
  onConnectionState: (state: PeerConnectionState) => void;
  /** Called once the reliable control channel is open, so the host can send the welcome. */
  onControlOpen: () => void;
  createPeerConnection?: (config: RTCConfiguration) => RTCPeerConnection;
}

/** Max 1080p30 video budget per guest; WebRTC lowers resolution under congestion. */
const VIDEO_MAX_BITRATE = 6_000_000;
const AUDIO_MAX_BITRATE = 128_000;
const MAX_ICE_RESTARTS = 3;
const MAX_QUEUED_CANDIDATES = 100;
/** If the guest never answers an offer, retry once, then give up. */
const ANSWER_TIMEOUT_MS = 15_000;

/**
 * One host → guest WebRTC connection. The host always makes the offer, so there is no glare.
 * Media is send-only; the guest talks back over DataChannels only.
 */
export class GuestPeer {
  readonly pc: RTCPeerConnection;
  private control: RTCDataChannel;
  private cursor: RTCDataChannel;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private iceRestarts = 0;
  private closed = false;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private answerTimer: ReturnType<typeof setTimeout> | null = null;
  private answerRetries = 0;
  private needsResync = false;
  private tunedSenders = false;

  constructor(private options: GuestPeerOptions) {
    const create = options.createPeerConnection ?? ((c) => new RTCPeerConnection(c));
    this.pc = create({ iceServers: options.iceServers as RTCIceServer[] });

    for (const track of options.stream.getTracks()) {
      if (track.kind === "video") {
        track.contentHint = "motion"; // keep frame rate, drop resolution under load
        this.pc.addTransceiver(track, {
          direction: "sendonly",
          streams: [options.stream],
          sendEncodings: [{ maxBitrate: VIDEO_MAX_BITRATE, maxFramerate: 30 }],
        });
      } else {
        this.pc.addTransceiver(track, {
          direction: "sendonly",
          streams: [options.stream],
          sendEncodings: [{ maxBitrate: AUDIO_MAX_BITRATE }],
        });
      }
    }

    this.control = this.pc.createDataChannel(CONTROL_CHANNEL, { ordered: true });
    this.cursor = this.pc.createDataChannel(CURSOR_CHANNEL, { ordered: false, maxRetransmits: 0 });
    for (const channel of [this.control, this.cursor]) {
      channel.onmessage = (event) => this.receive(event.data);
    }
    this.control.onopen = () => options.onControlOpen();

    this.pc.onicecandidate = (event) => {
      options.sendSignal({ candidate: event.candidate ? event.candidate.toJSON() : null });
    };
    this.pc.onconnectionstatechange = () => this.handleConnectionState();
  }

  get guestId() {
    return this.options.guestId;
  }

  async start(): Promise<void> {
    await this.offer();
  }

  async handleSignal(payload: SignalPayload): Promise<void> {
    if (this.closed) return;
    if ("description" in payload) {
      if (payload.description.type !== "answer") return; // host only ever offers
      if (this.pc.signalingState !== "have-local-offer") return;
      await this.pc.setRemoteDescription(payload.description);
      if (this.answerTimer) clearTimeout(this.answerTimer);
      this.answerTimer = null;
      this.answerRetries = 0;
      this.tuneSenders();
      const queued = this.pendingCandidates;
      this.pendingCandidates = [];
      for (const c of queued) await this.addCandidate(c);
      return;
    }
    if (!payload.candidate) return;
    if (!this.pc.remoteDescription) {
      if (this.pendingCandidates.length < MAX_QUEUED_CANDIDATES) {
        this.pendingCandidates.push(payload.candidate);
      }
      return;
    }
    await this.addCandidate(payload.candidate);
  }

  send(message: HostMessage): void {
    if (this.control.readyState === "open") this.control.send(JSON.stringify(message));
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
    if (this.answerTimer) clearTimeout(this.answerTimer);
    this.pc.onconnectionstatechange = null;
    this.pc.onicecandidate = null;
    this.control.onmessage = null;
    this.cursor.onmessage = null;
    this.pc.close();
    this.options.onConnectionState("closed");
  }

  /**
   * Called after the host's signaling socket comes back. An offer sent while it was down may
   * have been lost, so roll it back and offer again; a broken connection gets an ICE restart.
   */
  resync(): void {
    if (this.closed) return;
    const pending = this.pc.signalingState === "have-local-offer";
    const broken = this.pc.connectionState !== "connected";
    if (!pending && !broken && !this.needsResync) return;
    this.needsResync = false;
    this.renegotiate(this.pc.remoteDescription !== null).catch(() =>
      this.options.onConnectionState("failed"),
    );
  }

  private async renegotiate(iceRestart: boolean) {
    if (this.pc.signalingState === "have-local-offer") {
      await this.pc.setLocalDescription({ type: "rollback" });
    }
    await this.offer(iceRestart);
  }

  private async offer(iceRestart = false) {
    if (this.options.canSignal && !this.options.canSignal()) {
      this.needsResync = true;
      return;
    }
    const offer = await this.pc.createOffer({ iceRestart });
    if (this.closed) return;
    await this.pc.setLocalDescription(offer);
    const local = this.pc.localDescription;
    if (local) this.options.sendSignal({ description: { type: local.type, sdp: local.sdp } });
    if (this.answerTimer) clearTimeout(this.answerTimer);
    this.answerTimer = setTimeout(() => {
      this.answerTimer = null;
      if (this.closed || this.pc.signalingState !== "have-local-offer") return;
      if (this.answerRetries >= 1) {
        this.options.onConnectionState("failed");
        return;
      }
      this.answerRetries += 1;
      this.renegotiate(this.pc.remoteDescription !== null).catch(() =>
        this.options.onConnectionState("failed"),
      );
    }, ANSWER_TIMEOUT_MS);
  }

  /** Prefer frame rate over resolution under congestion (design: maintain-framerate). */
  private tuneSenders() {
    if (this.tunedSenders) return;
    this.tunedSenders = true;
    for (const sender of this.pc.getSenders()) {
      if (sender.track?.kind !== "video") continue;
      const params = sender.getParameters() as RTCRtpSendParameters & {
        degradationPreference?: string;
      };
      params.degradationPreference = "maintain-framerate";
      sender.setParameters(params).catch(() => {});
    }
  }

  private async addCandidate(candidate: RTCIceCandidateInit) {
    try {
      await this.pc.addIceCandidate(candidate);
    } catch {
      // Stale candidates after an ICE restart are expected; ignore them.
    }
  }

  private receive(data: unknown) {
    if (typeof data !== "string") return;
    const parsed = parseWire(GuestMessage, data);
    if (parsed.ok) this.options.onMessage(parsed.value);
  }

  private handleConnectionState() {
    const state = this.pc.connectionState;
    if (state === "connected") {
      this.iceRestarts = 0;
      if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
      this.options.onConnectionState("connected");
    } else if (state === "disconnected") {
      // Often recovers by itself; restart ICE if it doesn't within a few seconds.
      this.options.onConnectionState("reconnecting");
      this.disconnectTimer ??= setTimeout(() => {
        this.disconnectTimer = null;
        if (this.pc.connectionState === "disconnected") this.restartIce();
      }, 4_000);
    } else if (state === "failed") {
      this.restartIce();
    } else if (state === "new" || state === "connecting") {
      this.options.onConnectionState("connecting");
    }
  }

  private restartIce() {
    if (this.closed) return;
    if (this.options.canSignal && !this.options.canSignal()) {
      // Can't negotiate without signaling; resync() runs once the host is back.
      this.needsResync = true;
      this.options.onConnectionState("reconnecting");
      return;
    }
    if (this.iceRestarts >= MAX_ICE_RESTARTS || this.pc.signalingState !== "stable") {
      this.options.onConnectionState("failed");
      return;
    }
    this.iceRestarts += 1;
    this.options.onConnectionState("reconnecting");
    this.offer(true).catch(() => this.options.onConnectionState("failed"));
  }
}
