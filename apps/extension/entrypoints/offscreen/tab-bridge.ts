import { type GuestMessage, MediaState, type Participant } from "@watchalong/protocol";
import type { InjectedInput } from "../../lib/content/input-injector";
import { PORT_NAME } from "../../lib/messages";
import type { FromTab, ToTab } from "../../lib/tab-protocol";

const unit = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;
function validInput(i: unknown): i is InjectedInput {
  const v = i as InjectedInput | null;
  if (!v || !unit(v.x) || !unit(v.y)) return false;
  if (v.kind === "click" || v.kind === "dblclick") return true;
  return (
    v.kind === "wheel" &&
    Number.isFinite(v.dx) &&
    Number.isFinite(v.dy) &&
    Math.abs(v.dx) <= 5_000 &&
    Math.abs(v.dy) <= 5_000
  );
}

export interface TabBridgeOptions {
  onMediaState: (state: MediaState) => void;
  onViewport: (viewport: { width: number; height: number }) => void;
  /** The host toggled draw mode from inside the page (Escape). */
  onDrawingChanged: (drawing: boolean) => void;
  getRoster: () => Participant[];
}

interface FrameLink {
  port: chrome.runtime.Port;
  score: number;
  state: MediaState | null;
}

/**
 * Link between the host engine and the content scripts in the shared tab: one long-lived port
 * per frame. The top frame draws the overlay and injects clicks/scrolls; media commands go to
 * whichever frame has the most prominent video (it may be an embedded player).
 */
export class TabBridge {
  private frames = new Map<number, FrameLink>();
  private mediaFrame: number | null = null;
  private drawing = false;
  private rosterKey = "";
  private roster: Participant[] = [];
  /** challenge → input registered by a parent frame, waiting for the child's acknowledgement. */
  private pendingInputs = new Map<string, { input: InjectedInput; from: number; at: number }>();

  constructor(
    readonly tabId: number,
    private options: TabBridgeOptions,
  ) {
    this.roster = options.getRoster();
    chrome.runtime.onConnect.addListener(this.onConnect);
  }

  deliverGuestMessage(guest: Participant, message: GuestMessage): void {
    if (message.type === "media") {
      const target = this.mediaFrame ?? 0;
      this.post(target, { type: "guest", from: guest, message });
      return;
    }
    // Cursors, strokes, clicks and scrolls are handled by the top frame.
    this.post(0, { type: "guest", from: guest, message });
  }

  guestGone(guestId: string): void {
    this.post(0, { type: "guest-gone", id: guestId });
  }

  setRoster(roster: Participant[]): void {
    const key = JSON.stringify(roster);
    if (key === this.rosterKey) return;
    this.rosterKey = key;
    this.roster = roster;
    this.post(0, { type: "roster", participants: roster });
  }

  setDrawing(drawing: boolean): void {
    this.drawing = drawing;
    this.post(0, { type: "set-drawing", drawing });
  }

  dispose(): void {
    chrome.runtime.onConnect.removeListener(this.onConnect);
    for (const [frameId, link] of this.frames) {
      this.post(frameId, { type: "end" });
      link.port.disconnect();
    }
    this.frames.clear();
  }

  private onConnect = (port: chrome.runtime.Port) => {
    if (port.name !== PORT_NAME) return;
    const sender = port.sender;
    // Only our own content scripts, and only in the shared tab.
    if (
      !sender ||
      sender.id !== chrome.runtime.id ||
      sender.tab?.id !== this.tabId ||
      sender.frameId === undefined
    ) {
      port.disconnect();
      return;
    }
    const frameId = sender.frameId;
    const previous = this.frames.get(frameId);
    if (previous) previous.port.disconnect();
    const link: FrameLink = { port, score: 0, state: null };
    this.frames.set(frameId, link);

    port.onMessage.addListener((message: FromTab) => this.onFromTab(frameId, link, message));
    port.onDisconnect.addListener(() => {
      if (this.frames.get(frameId) !== link) return;
      this.frames.delete(frameId);
      if (this.mediaFrame === frameId) this.pickMediaFrame();
    });

    this.post(frameId, {
      type: "hello",
      isTop: frameId === 0,
      drawing: this.drawing,
      roster: this.roster,
    });
  };

  private onFromTab(frameId: number, link: FrameLink, message: FromTab) {
    if (this.frames.get(frameId) !== link || !message || typeof message !== "object") return;
    switch (message.type) {
      case "media-report": {
        const parsed = MediaState.safeParse(message.state);
        if (!parsed.success || !Number.isFinite(message.score)) return;
        link.state = parsed.data;
        link.score = Math.max(0, message.score);
        const before = this.mediaFrame;
        this.pickMediaFrame();
        if (this.mediaFrame === frameId || before !== this.mediaFrame) this.publishMedia();
        break;
      }
      case "viewport":
        if (frameId === 0 && Number.isFinite(message.width) && Number.isFinite(message.height)) {
          this.options.onViewport({ width: message.width, height: message.height });
        }
        break;
      case "frame-input": {
        if (typeof message.challenge !== "string" || !validInput(message.input)) return;
        const now = Date.now();
        for (const [k, v] of this.pendingInputs)
          if (now - v.at > 2_000) this.pendingInputs.delete(k);
        if (this.pendingInputs.size < 32) {
          this.pendingInputs.set(message.challenge, {
            input: message.input,
            from: frameId,
            at: now,
          });
        }
        break;
      }
      case "probe-ack": {
        const pending = this.pendingInputs.get(message.challenge);
        if (!pending || pending.from === frameId) return;
        this.pendingInputs.delete(message.challenge);
        this.post(frameId, { type: "inject", input: pending.input });
        break;
      }
      case "draw-key":
        if (frameId !== 0 && ["alt-down", "alt-up", "escape"].includes(message.key)) {
          this.post(0, { type: "draw-key", key: message.key });
        }
        break;
      case "drawing-changed":
        if (frameId === 0 && typeof message.drawing === "boolean") {
          this.drawing = message.drawing;
          this.options.onDrawingChanged(message.drawing);
        }
        break;
    }
  }

  private pickMediaFrame() {
    let best: number | null = null;
    let bestScore = 0;
    for (const [id, link] of this.frames) {
      if (link.state?.hasVideo && link.score > bestScore) {
        best = id;
        bestScore = link.score;
      }
    }
    const changed = best !== this.mediaFrame;
    this.mediaFrame = best;
    if (changed) this.publishMedia();
  }

  private publishMedia() {
    const link = this.mediaFrame === null ? this.frames.get(0) : this.frames.get(this.mediaFrame);
    const state = link?.state;
    this.options.onMediaState(
      state && this.mediaFrame !== null
        ? state
        : {
            hasVideo: false,
            paused: true,
            muted: false,
            currentTime: 0,
            duration: 0,
            playbackRate: 1,
          },
    );
  }

  private post(frameId: number, message: ToTab) {
    const link = this.frames.get(frameId);
    if (!link) return;
    try {
      link.port.postMessage(message);
    } catch {
      this.frames.delete(frameId);
    }
  }
}
