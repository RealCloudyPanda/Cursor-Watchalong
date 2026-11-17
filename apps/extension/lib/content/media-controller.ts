import type { GuestMessage, MediaState } from "@watchalong/protocol";
import { pickMainVideo } from "./pick-video";

type MediaCommand = Extract<GuestMessage, { type: "media" }>;

const RESCAN_MS = 1_000;
const TIME_REPORT_MS = 1_000;
const EVENTS = [
  "play",
  "playing",
  "pause",
  "seeked",
  "durationchange",
  "volumechange",
  "ratechange",
  "emptied",
  "loadedmetadata",
  "waiting",
  "stalled",
] as const;

/**
 * Finds the main <video> in this frame, applies semantic media commands to it, and reports
 * its state. Runs in every frame of the shared tab; the host engine picks the frame whose
 * video scores highest (largest visible area).
 */
export class MediaController {
  private video: HTMLVideoElement | null = null;
  private rescanTimer: ReturnType<typeof setInterval>;
  private lastTimeReport = 0;
  private lastKey = "";
  /**
   * Visible area of each video in the *top-level* viewport. IntersectionObserver's implicit
   * root accounts for clipping by every ancestor iframe, so an embedded player scrolled out of
   * view scores 0 even though it fills its own frame.
   */
  private visible = new WeakMap<HTMLVideoElement, number>();
  private observed = new WeakSet<HTMLVideoElement>();
  private io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const r = e.intersectionRect;
        this.visible.set(e.target as HTMLVideoElement, e.isIntersecting ? r.width * r.height : 0);
      }
      this.rescan();
    },
    { threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] },
  );

  /** A fully visible video that resizes doesn't re-fire IntersectionObserver; re-observe it. */
  private ro = new ResizeObserver((entries) => {
    for (const e of entries) {
      this.io.unobserve(e.target);
      this.io.observe(e.target);
    }
  });

  constructor(private report: (state: MediaState, score: number) => void) {
    this.rescan();
    this.rescanTimer = setInterval(() => this.rescan(), RESCAN_MS);
  }

  apply(command: MediaCommand) {
    const video = this.video ?? this.findVideo();
    if (!video) return;
    const duration = Number.isFinite(video.duration) ? video.duration : Number.POSITIVE_INFINITY;
    switch (command.action) {
      case "play":
        video.play().catch(() => {});
        break;
      case "pause":
        video.pause();
        break;
      case "toggle":
        if (video.paused) video.play().catch(() => {});
        else video.pause();
        break;
      case "seek":
        video.currentTime = clamp(command.value ?? 0, 0, duration);
        break;
      case "seekBy":
        video.currentTime = clamp(video.currentTime + (command.value ?? 0), 0, duration);
        break;
      case "mute":
        video.muted = true;
        break;
      case "unmute":
        video.muted = false;
        if (video.volume === 0) video.volume = 1;
        break;
    }
    this.emit(true);
  }

  dispose() {
    clearInterval(this.rescanTimer);
    this.io.disconnect();
    this.ro.disconnect();
    this.attach(null);
  }

  private rescan() {
    const next = this.findVideo();
    if (next !== this.video) this.attach(next);
    this.emit(false);
  }

  private findVideo(): HTMLVideoElement | null {
    const videos = [...document.querySelectorAll("video")];
    for (const v of videos) {
      if (!this.observed.has(v)) {
        this.observed.add(v);
        this.io.observe(v);
        this.ro.observe(v);
      }
    }
    const index = pickMainVideo(
      videos.map((v) => {
        return {
          visibleArea: this.visible.get(v) ?? 0,
          playing: !v.paused && !v.ended,
          hasSource: v.readyState > 0 || !!v.currentSrc || !!v.srcObject,
        };
      }),
    );
    return index >= 0 ? (videos[index] ?? null) : null;
  }

  private attach(video: HTMLVideoElement | null) {
    for (const e of EVENTS) this.video?.removeEventListener(e, this.onEvent);
    this.video?.removeEventListener("timeupdate", this.onTime);
    this.video = video;
    for (const e of EVENTS) video?.addEventListener(e, this.onEvent);
    video?.addEventListener("timeupdate", this.onTime);
    this.emit(true);
  }

  private onEvent = () => this.emit(true);

  private onTime = () => {
    if (Date.now() - this.lastTimeReport >= TIME_REPORT_MS) this.emit(true);
  };

  private emit(force: boolean) {
    const v = this.video;
    const state: MediaState = v
      ? {
          hasVideo: true,
          paused: v.paused || v.ended,
          muted: v.muted || v.volume === 0,
          currentTime: finite(v.currentTime),
          duration: Number.isFinite(v.duration) ? finite(v.duration) : 0,
          playbackRate: clamp(finite(v.playbackRate), 0, 16),
        }
      : {
          hasVideo: false,
          paused: true,
          muted: false,
          currentTime: 0,
          duration: 0,
          playbackRate: 1,
        };
    const score = v ? (this.visible.get(v) ?? 0) : 0;
    // Skip identical reports from the periodic rescan; forced reports always go out.
    const key = `${state.hasVideo}|${state.paused}|${state.muted}|${state.duration}|${Math.round(score / 1000)}`;
    if (!force && key === this.lastKey) return;
    this.lastKey = key;
    this.lastTimeReport = Date.now();
    this.report(state, score);
  }
}

const finite = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
