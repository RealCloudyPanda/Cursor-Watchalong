import { HostSession } from "@watchalong/host-core";
import { CAPTURE_CONSTRAINTS } from "@watchalong/protocol";
import { PUBLIC_ORIGIN, WS_URL } from "../../lib/config";
import { type ExtMessage, sendExt } from "../../lib/messages";
import { TabBridge } from "./tab-bridge";

/**
 * The host engine. Owns the captured MediaStream, plays the tab's audio back locally,
 * and runs the HostSession (signaling + one WebRTC connection per guest).
 * Lives for the whole session so the service worker can sleep.
 */

let session: HostSession | null = null;
let stream: MediaStream | null = null;
let audioCtx: AudioContext | null = null;
let bridge: TabBridge | null = null;
/** Bumped by every start and end so a cancelled start can't publish a live session. */
let generation = 0;

chrome.runtime.onMessage.addListener((message: ExtMessage, sender) => {
  if (message.target !== "offscreen" || sender.id !== chrome.runtime.id) return;
  switch (message.type) {
    case "start":
      start(message.streamId, message.tabId, message.hostName).catch((err: unknown) => {
        stopCapture();
        sendExt({
          target: "background",
          type: "offscreen-error",
          error: err instanceof Error ? err.message : String(err),
        });
      });
      break;
    case "admit":
      session?.admit(message.guestId);
      break;
    case "deny":
      session?.deny(message.guestId);
      break;
    case "kick":
      session?.kick(message.guestId);
      break;
    case "set-control":
      session?.setControl(message.guestId, message.canControl);
      break;
    case "set-control-all":
      session?.setControlForAll(message.canControl);
      break;
    case "set-drawing":
      bridge?.setDrawing(message.drawing);
      break;
    case "end":
      generation += 1;
      if (session) session.end("host-ended");
      else stopCapture();
      break;
  }
});

async function start(streamId: string, tabId: number, hostName: string) {
  if (session && session.snapshot.status !== "ended") return;
  const gen = ++generation;
  const tabSource = { chromeMediaSource: "tab", chromeMediaSourceId: streamId };
  stream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: tabSource },
    video: {
      mandatory: {
        ...tabSource,
        maxWidth: CAPTURE_CONSTRAINTS.width,
        maxHeight: CAPTURE_CONSTRAINTS.height,
        maxFrameRate: CAPTURE_CONSTRAINTS.frameRate,
      },
    },
  } as unknown as MediaStreamConstraints);
  if (gen !== generation) {
    // Stopped while capture was starting: release it and publish nothing.
    for (const track of stream.getTracks()) track.stop();
    stream = null;
    return;
  }

  // Tab capture mutes the tab for the host; play its audio back locally.
  audioCtx = new AudioContext();
  audioCtx.createMediaStreamSource(stream).connect(audioCtx.destination);

  const current = new HostSession({
    wsUrl: WS_URL,
    publicOrigin: PUBLIC_ORIGIN,
    hostName,
    stream,
    onGuestMessage: (guest, message) => bridge?.deliverGuestMessage(guest, message),
    onGuestGone: (guestId) => bridge?.guestGone(guestId),
    onStateChange: (host) => {
      bridge?.setRoster(current.roster);
      sendExt({ target: "background", type: "host-state", host });
      if (host.status === "ended") stopCapture();
    },
  });
  session = current;
  bridge = new TabBridge(tabId, {
    onMediaState: (state) => current.updateMediaState(state),
    onViewport: (viewport) => current.updateViewport(viewport),
    getRoster: () => current.roster,
  });

  // If the host stops capture from Chrome's own UI, end the session.
  for (const track of stream.getTracks()) {
    track.addEventListener("ended", () => current.end("capture-ended"));
  }
  current.start();
}

function stopCapture() {
  for (const track of stream?.getTracks() ?? []) track.stop();
  stream = null;
  audioCtx?.close().catch(() => {});
  audioCtx = null;
  bridge?.dispose();
  bridge = null;
}
