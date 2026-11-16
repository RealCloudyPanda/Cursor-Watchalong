import { z } from "zod";
import { DisplayName, PeerId } from "./signaling";

/** Peer messages travel over WebRTC DataChannels between a guest and the host (hub). */

export const CURSOR_CHANNEL = "cursor"; // unordered, maxRetransmits: 0
export const CONTROL_CHANNEL = "control"; // reliable, ordered

const Unit = z.number().min(0).max(1);
const StrokeId = z.string().min(1).max(32);

export const MediaAction = z.enum(["play", "pause", "toggle", "seek", "seekBy", "mute", "unmute"]);
export type MediaAction = z.infer<typeof MediaAction>;

// ── Guest → host ─────────────────────────────────────────────────

export const GuestMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("cursor"), x: Unit, y: Unit }),
  z.object({ type: z.literal("cursor-leave") }),
  z.object({ type: z.literal("stroke-start"), strokeId: StrokeId, x: Unit, y: Unit }),
  z.object({ type: z.literal("stroke-point"), strokeId: StrokeId, x: Unit, y: Unit }),
  z.object({ type: z.literal("stroke-end"), strokeId: StrokeId }),
  z.object({
    type: z.literal("media"),
    action: MediaAction,
    /** Seconds: absolute for `seek`, relative for `seekBy`. */
    value: z.number().finite().optional(),
  }),
  z.object({ type: z.literal("pointer"), kind: z.enum(["click", "dblclick"]), x: Unit, y: Unit }),
  z.object({
    type: z.literal("wheel"),
    x: Unit,
    y: Unit,
    dx: z.number().finite().min(-5_000).max(5_000),
    dy: z.number().finite().min(-5_000).max(5_000),
  }),
]);
export type GuestMessage = z.infer<typeof GuestMessage>;

/** Guest messages that act on the page and therefore require `canControl`. */
export const CONTROL_MESSAGE_TYPES = new Set<GuestMessage["type"]>(["media", "pointer", "wheel"]);

export function requiresControl(message: GuestMessage): boolean {
  return CONTROL_MESSAGE_TYPES.has(message.type);
}

// ── Host → guests ────────────────────────────────────────────────

export const Participant = z.object({
  id: PeerId,
  name: DisplayName,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  role: z.enum(["host", "guest"]),
  canControl: z.boolean(),
});
export type Participant = z.infer<typeof Participant>;

export const MediaState = z.object({
  hasVideo: z.boolean(),
  paused: z.boolean(),
  muted: z.boolean(),
  currentTime: z.number().finite().min(0),
  /** Seconds; 0 when unknown, Infinity is sent as 0 for live streams. */
  duration: z.number().finite().min(0),
  playbackRate: z.number().finite().min(0).max(16),
});
export type MediaState = z.infer<typeof MediaState>;

export const HostMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("welcome"), you: PeerId }),
  z.object({ type: z.literal("roster"), participants: z.array(Participant).max(16) }),
  z.object({ type: z.literal("activity"), by: PeerId, text: z.string().max(120) }),
  z.object({ type: z.literal("command-rejected"), reason: z.enum(["no-control", "rate-limited"]) }),
  z.object({ type: z.literal("media-state"), state: MediaState }),
  /** Size of the shared tab's viewport in CSS pixels, used to map coordinates exactly. */
  z.object({
    type: z.literal("tab-info"),
    viewport: z.object({
      width: z.number().int().min(1).max(20_000),
      height: z.number().int().min(1).max(20_000),
    }),
  }),
]);
export type HostMessage = z.infer<typeof HostMessage>;
