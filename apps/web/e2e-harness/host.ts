/**
 * Dev-only stand-in for the extension's offscreen document. It streams an animated canvas plus
 * a test tone through the real HostSession, and records what the tab would have received, so
 * Playwright can drive a full host ↔ guest session without tab capture.
 * Not part of the production build (only index.html is an entry).
 */
import { HostSession, type HostState } from "@watchalong/host-core";
import type { GuestMessage, MediaState, Participant } from "@watchalong/protocol";

const canvas = document.getElementById("tab") as HTMLCanvasElement;
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
let frame = 0;
const scenic = new URLSearchParams(location.search).has("scene");
const draw = () => {
  frame += 1;
  if (scenic) drawScene(frame);
  else {
    ctx.fillStyle = `hsl(${frame % 360} 60% 30%)`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.font = "64px system-ui";
    ctx.fillText(`frame ${frame}`, 80, 140);
  }
  requestAnimationFrame(draw);
};

/** A calm animated landscape, used for README screenshots (?scene). */
function drawScene(f: number) {
  const { width: w, height: h } = canvas;
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#1e1b4b");
  sky.addColorStop(0.55, "#be185d");
  sky.addColorStop(1, "#f59e0b");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  const sx = w * 0.62 + Math.sin(f / 240) * 20;
  const sun = ctx.createRadialGradient(sx, h * 0.58, 10, sx, h * 0.58, 150);
  sun.addColorStop(0, "#fde68a");
  sun.addColorStop(0.4, "#fbbf24");
  sun.addColorStop(1, "rgba(251,191,36,0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, h);
  const ridge = (base: number, amp: number, color: string, phase: number) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 16) {
      ctx.lineTo(
        x,
        base + Math.sin(x / 140 + phase) * amp + Math.sin(x / 47 + phase * 2) * amp * 0.3,
      );
    }
    ctx.lineTo(w, h);
    ctx.fill();
  };
  ridge(h * 0.66, 36, "#4c1d95", f / 900);
  ridge(h * 0.76, 28, "#2e1065", 1.7 + f / 600);
  ridge(h * 0.87, 20, "#0f0a1e", 3.1 + f / 400);
}
draw();

const video = canvas.captureStream(30);
const audioCtx = new AudioContext();
const osc = audioCtx.createOscillator();
const dest = audioCtx.createMediaStreamDestination();
osc.connect(dest);
osc.start();
const stream = new MediaStream([...video.getTracks(), ...dest.stream.getTracks()]);

const params = new URLSearchParams(location.search);
const received: { from: Participant; message: GuestMessage }[] = [];
const gone: string[] = [];
let state: HostState | null = null;

const session = new HostSession({
  wsUrl: `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`,
  publicOrigin: location.origin,
  hostName: params.get("name") ?? "Hosty",
  stream,
  onGuestMessage: (from, message) => {
    received.push({ from, message });
    if (message.type === "media") {
      // Pretend the tab applied the command.
      const paused = message.action === "pause" || (message.action === "toggle" && !media.paused);
      media = { ...media, paused: message.action === "play" ? false : paused };
      session.updateMediaState(media);
    }
  },
  onGuestGone: (id) => gone.push(id),
  onStateChange: (s) => {
    state = s;
    (document.getElementById("log") as HTMLElement).textContent = JSON.stringify(s, null, 2);
  },
});

let media: MediaState = {
  hasVideo: true,
  paused: false,
  muted: false,
  currentTime: 12,
  duration: 300,
  playbackRate: 1,
};

session.start();
session.updateViewport({ width: 1280, height: 720 });
session.updateMediaState(media);

Object.assign(window, {
  __host: {
    session,
    get state() {
      return state;
    },
    received,
    gone,
  },
});
