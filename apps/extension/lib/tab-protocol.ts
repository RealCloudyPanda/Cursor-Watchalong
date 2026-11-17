import type { GuestMessage, MediaState, Participant } from "@watchalong/protocol";
import type { InjectedInput } from "./content/input-injector";

/**
 * Messages on the long-lived port between the content script (one per frame of the shared tab)
 * and the offscreen host engine. Only our own content scripts can open this port
 * (no externally_connectable), and the engine drops ports from any other tab.
 */

export type ToTab =
  | {
      type: "hello";
      isTop: boolean;
      drawing: boolean;
      roster: Participant[];
    }
  | { type: "roster"; participants: Participant[] }
  | { type: "guest"; from: Participant; message: GuestMessage }
  | { type: "guest-gone"; id: string }
  | { type: "set-drawing"; drawing: boolean }
  | { type: "draw-key"; key: DrawKey }
  /** Input forwarded from a parent frame (see InputInjector). */
  | { type: "inject"; input: InjectedInput }
  | { type: "end" };

export type FromTab =
  | { type: "media-report"; state: MediaState; score: number }
  | { type: "viewport"; width: number; height: number }
  | { type: "drawing-changed"; drawing: boolean }
  /** Alt/Escape pressed while focus is inside a child frame, relayed to the top overlay. */
  | { type: "draw-key"; key: DrawKey }
  /** Sent once per frame: its origin and its parent's origin (location.ancestorOrigins). */
  | { type: "frame-info"; origin: string; parentOrigin: string | null }
  /** Input for whichever child frame acknowledges `challenge`. */
  | { type: "frame-input"; challenge: string; input: InjectedInput }
  | { type: "probe-ack"; challenge: string };

export type DrawKey = "alt-down" | "alt-up" | "escape";
