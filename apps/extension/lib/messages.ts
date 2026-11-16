import type { HostState } from "@watchalong/host-core";

/**
 * Runtime messages between extension contexts. Every message names its `target` because
 * chrome.runtime.sendMessage reaches every extension page.
 * Offscreen documents only get chrome.runtime, so the background owns chrome.storage writes.
 */

export interface SessionState {
  status: "idle" | "starting" | "live" | "ended";
  tabId?: number;
  tabTitle?: string;
  tabHost?: string;
  drmWarning?: boolean;
  host?: HostState;
  error?: string;
  /** Host's own draw mode (M3). */
  drawing?: boolean;
}

export const IDLE_SESSION: SessionState = { status: "idle" };

export type ExtMessage =
  // popup / side panel → background
  | { target: "background"; type: "start-sharing"; tabId: number }
  | { target: "background"; type: "stop-sharing" }
  | { target: "background"; type: "focus-shared-tab" }
  // background → offscreen
  | {
      target: "offscreen";
      type: "start";
      streamId: string;
      tabId: number;
      hostName: string;
    }
  // side panel → offscreen
  | { target: "offscreen"; type: "admit" | "deny" | "kick"; guestId: string }
  | { target: "offscreen"; type: "set-control"; guestId: string; canControl: boolean }
  | { target: "offscreen"; type: "set-control-all"; canControl: boolean }
  | { target: "offscreen"; type: "set-drawing"; drawing: boolean }
  | { target: "offscreen"; type: "end" }
  // offscreen → background
  | { target: "background"; type: "host-state"; host: HostState }
  | { target: "background"; type: "offscreen-error"; error: string };

export const SESSION_KEY = "session";
export const HOST_NAME_KEY = "hostName";
export const PORT_NAME = "watchalong-frame";

export function sendExt(message: ExtMessage): Promise<unknown> {
  return chrome.runtime.sendMessage(message).catch(() => undefined);
}
