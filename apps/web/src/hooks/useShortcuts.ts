import type { GuestMessage } from "@watchalong/protocol";
import { useEffect } from "react";

type Media = Extract<GuestMessage, { type: "media" }>;

/** Keyboard shortcut → semantic media command, YouTube-style. */
export function shortcutToCommand(key: string, muted: boolean): Media | null {
  switch (key) {
    case " ":
    case "k":
    case "K":
      return { type: "media", action: "toggle" };
    case "j":
    case "J":
      return { type: "media", action: "seekBy", value: -10 };
    case "l":
    case "L":
      return { type: "media", action: "seekBy", value: 10 };
    case "ArrowLeft":
      return { type: "media", action: "seekBy", value: -5 };
    case "ArrowRight":
      return { type: "media", action: "seekBy", value: 5 };
    case "m":
    case "M":
      return { type: "media", action: muted ? "unmute" : "mute" };
    default:
      return null;
  }
}

export function useShortcuts(
  enabled: boolean,
  muted: boolean,
  onCommand: (command: Media) => void,
) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (
        target?.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']")
      ) {
        return;
      }
      // Let Space/Enter activate a focused button instead of toggling playback.
      if ((e.key === " " || e.key === "Enter") && target?.closest("button, [role='slider']")) {
        return;
      }
      if (target?.closest("[role='slider']") && e.key.startsWith("Arrow")) return;
      const command = shortcutToCommand(e.key, muted);
      if (!command) return;
      e.preventDefault();
      onCommand(command);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, muted, onCommand]);
}
