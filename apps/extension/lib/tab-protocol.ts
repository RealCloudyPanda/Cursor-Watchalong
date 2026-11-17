import type { GuestMessage, MediaState, Participant } from "@watchalong/protocol";

/**
 * Messages on the long-lived port between the content script (one per frame of the shared tab)
 * and the offscreen host engine. Only our own content scripts can open this port
 * (no externally_connectable), and the engine drops ports from any other tab.
 */

export type ToTab =
  | {
      type: "hello";
      isTop: boolean;
      /** Shared secret for parent → child frame messages (clicks inside iframes, M4). */
      nonce: string;
      drawing: boolean;
      roster: Participant[];
    }
  | { type: "roster"; participants: Participant[] }
  | { type: "guest"; from: Participant; message: GuestMessage }
  | { type: "guest-gone"; id: string }
  | { type: "set-drawing"; drawing: boolean }
  | { type: "draw-key"; key: DrawKey }
  | { type: "end" };

export type FromTab =
  | { type: "media-report"; state: MediaState; score: number }
  | { type: "viewport"; width: number; height: number }
  | { type: "drawing-changed"; drawing: boolean }
  /** Alt/Escape pressed while focus is inside a child frame, relayed to the top overlay. */
  | { type: "draw-key"; key: DrawKey };

export type DrawKey = "alt-down" | "alt-up" | "escape";
