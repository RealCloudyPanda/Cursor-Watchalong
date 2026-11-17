import { z } from "zod";
import { MAX_NAME_LENGTH } from "./constants";

/** Signaling messages travel over the WebSocket between a client and the room server. */

export const RoomId = z.string().regex(/^[A-Za-z0-9_-]{10,32}$/);
export const PeerId = z.string().regex(/^[A-Za-z0-9_-]{6,32}$/);
export const Secret = z.string().min(16).max(128);
export const DisplayName = z.string().trim().min(1).max(MAX_NAME_LENGTH);

export const IceServer = z.object({
  urls: z.union([z.string(), z.array(z.string())]),
  username: z.string().optional(),
  credential: z.string().optional(),
});
export type IceServer = z.infer<typeof IceServer>;

const SessionDescription = z.object({
  type: z.enum(["offer", "answer", "pranswer", "rollback"]),
  sdp: z.string().max(64_000).optional(),
});

const IceCandidate = z.object({
  candidate: z.string().max(2_000),
  sdpMid: z.string().nullable().optional(),
  sdpMLineIndex: z.number().int().nullable().optional(),
  usernameFragment: z.string().nullable().optional(),
});

const SignalPayload = z.union([
  z.object({ description: SessionDescription }),
  z.object({ candidate: IceCandidate.nullable() }),
]);

// ── Client → server ──────────────────────────────────────────────

export const ClientMessage = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create-room"),
    name: DisplayName,
    /** Required when the server sets HOST_PIN. */
    pin: z.string().max(128).optional(),
  }),
  z.object({
    type: z.literal("resume-host"),
    roomId: RoomId,
    hostToken: Secret,
  }),
  z.object({
    type: z.literal("join"),
    roomId: RoomId,
    secret: Secret,
    name: DisplayName,
    rejoinToken: Secret.optional(),
  }),
  z.object({ type: z.literal("admit"), guestId: PeerId }),
  z.object({ type: z.literal("deny"), guestId: PeerId }),
  z.object({ type: z.literal("kick"), guestId: PeerId }),
  z.object({ type: z.literal("end-room") }),
  z.object({ type: z.literal("signal"), to: PeerId, payload: SignalPayload }),
  z.object({ type: z.literal("ping") }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

// ── Server → client ──────────────────────────────────────────────

export const ErrorCode = z.enum([
  "bad-message",
  "room-not-found",
  "bad-secret",
  "room-full",
  "not-host",
  "unknown-peer",
  "rate-limited",
  "bad-pin",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ServerMessage = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("room-created"),
    roomId: RoomId,
    secret: Secret,
    hostId: PeerId,
    hostToken: Secret,
    iceServers: z.array(IceServer),
  }),
  z.object({
    type: z.literal("host-resumed"),
    roomId: RoomId,
    guests: z.array(z.object({ guestId: PeerId, name: DisplayName, seq: z.number().int().min(0) })),
    pending: z.array(z.object({ guestId: PeerId, name: DisplayName })),
    iceServers: z.array(IceServer),
  }),
  z.object({ type: z.literal("waiting-for-host"), guestId: PeerId }),
  z.object({ type: z.literal("join-request"), guestId: PeerId, name: DisplayName }),
  z.object({
    type: z.literal("admitted"),
    guestId: PeerId,
    hostId: PeerId,
    rejoinToken: Secret,
    iceServers: z.array(IceServer),
  }),
  /** `seq` changes every time the guest is (re)admitted, i.e. whenever it has a new connection. */
  z.object({
    type: z.literal("guest-joined"),
    guestId: PeerId,
    name: DisplayName,
    seq: z.number().int().min(0),
  }),
  z.object({ type: z.literal("guest-left"), guestId: PeerId }),
  z.object({ type: z.literal("denied") }),
  z.object({ type: z.literal("kicked") }),
  z.object({ type: z.literal("host-away"), graceMs: z.number().int() }),
  z.object({ type: z.literal("host-back") }),
  z.object({ type: z.literal("room-ended") }),
  z.object({ type: z.literal("signal"), from: PeerId, payload: SignalPayload }),
  z.object({ type: z.literal("error"), code: ErrorCode, message: z.string().optional() }),
  z.object({ type: z.literal("pong") }),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;
