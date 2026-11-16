import type { IceServer } from "@watchalong/protocol";

/**
 * ICE servers handed to every participant.
 * M5: when CF_TURN_KEY_ID / CF_TURN_API_TOKEN are set, mint short-lived Cloudflare TURN
 * credentials here instead of returning public STUN only.
 */
export function defaultIceServers(): IceServer[] {
  return [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }];
}
