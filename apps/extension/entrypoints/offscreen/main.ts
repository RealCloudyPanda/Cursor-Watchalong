import { CAPTURE_CONSTRAINTS, parseWire, ServerMessage } from "@watchalong/protocol";
import { PUBLIC_ORIGIN, WS_URL } from "../../lib/config";
import type { ExtMessage, JoinRequest, SessionState } from "../../lib/messages";

/**
 * Owns the captured MediaStream, the signaling WebSocket and (M1+) one RTCPeerConnection per guest.
 * Lives as long as the session so the service worker can sleep.
 */

let stream: MediaStream | null = null;
let ws: WebSocket | null = null;
let pending: JoinRequest[] = [];
let guests: JoinRequest[] = [];

function update(patch: Partial<SessionState>) {
  const msg: ExtMessage = { target: "background", type: "session-update", patch };
  chrome.runtime.sendMessage(msg).catch(() => {});
}

function send(message: object) {
  ws?.send(JSON.stringify(message));
}

chrome.runtime.onMessage.addListener((message: ExtMessage) => {
  if (message.target !== "offscreen") return;
  switch (message.type) {
    case "start":
      start(message.streamId, message.hostName).catch((err: unknown) =>
        update({ status: "idle", error: String(err) }),
      );
      break;
    case "admit":
    case "deny":
      send({ type: message.type, guestId: message.guestId });
      pending = pending.filter((p) => p.guestId !== message.guestId);
      update({ pending });
      break;
    case "end":
      end();
      break;
  }
});

async function start(streamId: string, hostName: string) {
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

  // Tab capture mutes the tab for the host; play the audio back locally.
  const audioCtx = new AudioContext();
  audioCtx.createMediaStreamSource(stream).connect(audioCtx.destination);

  // If the host stops capture from Chrome's UI, end the session.
  stream.getVideoTracks()[0]?.addEventListener("ended", end);

  ws = new WebSocket(WS_URL);
  ws.onopen = () => send({ type: "create-room", name: hostName });
  ws.onmessage = (event) => {
    const parsed = parseWire(ServerMessage, String(event.data));
    if (!parsed.ok) return;
    const msg = parsed.value;
    switch (msg.type) {
      case "room-created":
        update({ status: "live", inviteUrl: `${PUBLIC_ORIGIN}/r/${msg.roomId}#k=${msg.secret}` });
        break;
      case "join-request":
        pending = [...pending, { guestId: msg.guestId, name: msg.name }];
        update({ pending });
        break;
      case "guest-joined":
        guests = [...guests, { guestId: msg.guestId, name: msg.name }];
        update({ guests });
        // M1: create RTCPeerConnection, add stream tracks, send offer via `signal`.
        break;
      case "guest-left":
        guests = guests.filter((g) => g.guestId !== msg.guestId);
        update({ guests });
        break;
      case "signal":
        // M1: apply remote description / ICE candidate to that guest's peer connection.
        break;
      case "room-ended":
        end();
        break;
      case "error":
        update({ error: msg.code });
        break;
    }
  };
  ws.onclose = () => {
    // M5: resume-host within the 30s grace window instead of ending.
    if (stream) end();
  };
}

function end() {
  if (ws?.readyState === WebSocket.OPEN) send({ type: "end-room" });
  ws?.close();
  ws = null;
  for (const track of stream?.getTracks() ?? []) track.stop();
  stream = null;
  update({ status: "ended", pending: [], guests: [] });
}
