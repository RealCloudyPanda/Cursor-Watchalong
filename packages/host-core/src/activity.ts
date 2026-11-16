import type { GuestMessage, MediaState } from "@watchalong/protocol";
import { formatTime } from "@watchalong/protocol";

/** Human-readable activity line for a media command, e.g. "paused" or "skipped to 3:21". */
export function describeMediaAction(
  message: Extract<GuestMessage, { type: "media" }>,
  state: MediaState | null,
): string {
  switch (message.action) {
    case "play":
      return "played";
    case "pause":
      return "paused";
    case "toggle":
      return state?.paused === false ? "paused" : "played";
    case "seek":
      return `skipped to ${formatTime(message.value ?? 0)}`;
    case "seekBy": {
      const v = message.value ?? 0;
      return v >= 0 ? `skipped ahead ${Math.round(v)}s` : `went back ${Math.round(-v)}s`;
    }
    case "mute":
      return "muted the video";
    case "unmute":
      return "unmuted the video";
  }
}
