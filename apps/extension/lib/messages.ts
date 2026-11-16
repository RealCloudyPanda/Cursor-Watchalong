/**
 * Runtime messages between extension contexts. Every message names its `target` because
 * chrome.runtime.sendMessage broadcasts to all extension pages.
 * Offscreen documents only get chrome.runtime, so the background owns chrome.storage writes.
 */

export interface JoinRequest {
  guestId: string;
  name: string;
}

export interface SessionState {
  status: "idle" | "starting" | "live" | "ended";
  tabId?: number;
  inviteUrl?: string;
  drmWarning?: boolean;
  pending: JoinRequest[];
  guests: JoinRequest[];
  error?: string;
}

export const IDLE_SESSION: SessionState = { status: "idle", pending: [], guests: [] };

export type ExtMessage =
  // popup / side panel → background
  | { target: "background"; type: "start-sharing"; tabId: number }
  | { target: "background"; type: "stop-sharing" }
  // background → offscreen
  | { target: "offscreen"; type: "start"; streamId: string; hostName: string }
  // side panel → offscreen
  | { target: "offscreen"; type: "admit" | "deny"; guestId: string }
  | { target: "offscreen"; type: "end" }
  // offscreen → background
  | { target: "background"; type: "session-update"; patch: Partial<SessionState> };

export const SESSION_KEY = "session";
