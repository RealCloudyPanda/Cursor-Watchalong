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
const draw = () => {
  frame += 1;
  ctx.fillStyle = `hsl(${frame % 360} 60% 30%)`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.font = "64px system-ui";
  ctx.fillText(`frame ${frame}`, 80, 140);
  requestAnimationFrame(draw);
};
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
