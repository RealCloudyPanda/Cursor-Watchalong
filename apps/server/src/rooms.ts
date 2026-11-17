import { timingSafeEqual } from "node:crypto";
import {
  type ClientMessage,
  type ErrorCode,
  HOST_RECONNECT_GRACE_MS,
  type IceServer,
  MAX_GUESTS,
  MAX_PENDING,
  PENDING_TTL_MS,
  REJOIN_TOKEN_TTL_MS,
  type ServerMessage,
} from "@watchalong/protocol";
import { newPeerId, newRoomId, newSecret } from "./ids";

/** A connected WebSocket, abstracted so the registry can be unit-tested. */
export interface Conn {
  send(message: ServerMessage): void;
  close(): void;
}

interface Guest {
  id: string;
  name: string;
  conn: Conn;
  /** Admission counter; a new value means a new guest connection. */
  seq?: number;
  pendingTimer?: ReturnType<typeof setTimeout>;
}

interface RejoinGrant {
  token: string;
  guestId: string;
  /** Infinity while the guest is connected; the 5-minute window starts when they disconnect. */
  expiresAt: number;
}

interface Room {
  id: string;
  secret: string;
  hostId: string;
  hostToken: string;
  host: Conn | null;
  hostGraceTimer: ReturnType<typeof setTimeout> | null;
  pending: Map<string, Guest>;
  guests: Map<string, Guest>;
  /** Keyed by guest id: at most one live grant per guest. */
  rejoin: Map<string, RejoinGrant>;
  admitSeq: number;
}

/** Where a connection sits, so messages can be routed without trusting client-supplied ids. */
type Membership =
  | { role: "host"; room: Room }
  | { role: "pending"; room: Room; guestId: string }
  | { role: "guest"; room: Room; guestId: string };

export interface RegistryOptions {
  iceServers: () => IceServer[];
  /** Hard cap on concurrent rooms, as a memory safety net. */
  maxRooms?: number;
  /** When set, creating a room requires this PIN (guests are unaffected). */
  hostPin?: string;
}

const safeEqual = (a: string, b: string) => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
};

/**
 * In-memory rooms. No persistence by design: a server restart ends every room.
 * The server only handles admission and signaling; room traffic flows peer-to-peer.
 */
export class RoomRegistry {
  private rooms = new Map<string, Room>();
  private members = new Map<Conn, Membership>();

  constructor(private options: RegistryOptions) {}

  get roomCount() {
    return this.rooms.size;
  }

  handle(conn: Conn, message: ClientMessage): void {
    switch (message.type) {
      case "ping":
        conn.send({ type: "pong" });
        break;
      case "create-room":
        this.createRoom(conn, message.pin);
        break;
      case "resume-host":
        this.resumeHost(conn, message.roomId, message.hostToken);
        break;
      case "join":
        this.join(conn, message);
        break;
      case "admit":
      case "deny":
      case "kick":
        this.hostAction(conn, message.type, message.guestId);
        break;
      case "end-room":
        this.withHost(conn, (room) => this.endRoom(room));
        break;
      case "signal":
        this.signal(conn, message.to, message.payload);
        break;
    }
  }

  disconnect(conn: Conn): void {
    const membership = this.members.get(conn);
    this.members.delete(conn);
    if (!membership) return;
    const { room } = membership;

    if (membership.role === "host") {
      if (room.host !== conn) return;
      room.host = null;
      this.broadcastGuests(room, { type: "host-away", graceMs: HOST_RECONNECT_GRACE_MS });
      room.hostGraceTimer = setTimeout(() => this.endRoom(room), HOST_RECONNECT_GRACE_MS);
      return;
    }

    if (membership.role === "pending") {
      const guest = room.pending.get(membership.guestId);
      if (guest?.conn !== conn) return;
      clearTimeout(guest.pendingTimer);
      room.pending.delete(membership.guestId);
      room.host?.send({ type: "guest-left", guestId: membership.guestId });
      return;
    }

    const guest = room.guests.get(membership.guestId);
    if (guest?.conn !== conn) return; // already replaced by a newer connection
    room.guests.delete(membership.guestId);
    const grant = room.rejoin.get(membership.guestId);
    if (grant) grant.expiresAt = Date.now() + REJOIN_TOKEN_TTL_MS;
    room.host?.send({ type: "guest-left", guestId: membership.guestId });
  }

  // ── Host lifecycle ────────────────────────────────────────────

  private createRoom(conn: Conn, pin?: string) {
    if (this.members.has(conn)) return this.error(conn, "bad-message", "already in a room");
    const required = this.options.hostPin;
    if (required && !safeEqual(required, pin ?? "")) return this.error(conn, "bad-pin");
    if (this.rooms.size >= (this.options.maxRooms ?? 10_000)) {
      return this.error(conn, "rate-limited", "server busy");
    }
    const room: Room = {
      id: newRoomId(),
      secret: newSecret(),
      hostId: newPeerId(),
      hostToken: newSecret(),
      host: conn,
      hostGraceTimer: null,
      pending: new Map(),
      guests: new Map(),
      rejoin: new Map(),
      admitSeq: 0,
    };
    this.rooms.set(room.id, room);
    this.members.set(conn, { role: "host", room });
    conn.send({
      type: "room-created",
      roomId: room.id,
      secret: room.secret,
      hostId: room.hostId,
      hostToken: room.hostToken,
      iceServers: this.options.iceServers(),
    });
  }

  private resumeHost(conn: Conn, roomId: string, hostToken: string) {
    const existing = this.members.get(conn);
    if (existing && !(existing.role === "host" && existing.room.id === roomId)) {
      return this.error(conn, "bad-message", "already in a room");
    }
    const room = this.rooms.get(roomId);
    if (!room) return this.error(conn, "room-not-found");
    if (!safeEqual(room.hostToken, hostToken)) return this.error(conn, "not-host");

    if (room.hostGraceTimer) clearTimeout(room.hostGraceTimer);
    room.hostGraceTimer = null;
    if (room.host && room.host !== conn) {
      this.members.delete(room.host);
      room.host.close();
    }
    room.host = conn;
    this.members.set(conn, { role: "host", room });
    // Authoritative snapshot so the host can reconcile anything that changed while it was away.
    conn.send({
      type: "host-resumed",
      roomId: room.id,
      guests: [...room.guests.values()].map((g) => ({
        guestId: g.id,
        name: g.name,
        seq: g.seq ?? 0,
      })),
      pending: [...room.pending.values()].map((g) => ({ guestId: g.id, name: g.name })),
      iceServers: this.options.iceServers(),
    });
    this.broadcastGuests(room, { type: "host-back" });
  }

  private endRoom(room: Room) {
    if (this.rooms.get(room.id) !== room) return;
    if (room.hostGraceTimer) clearTimeout(room.hostGraceTimer);
    this.rooms.delete(room.id);
    for (const g of room.pending.values()) clearTimeout(g.pendingTimer);
    const everyone = [...room.guests.values(), ...room.pending.values()].map((g) => g.conn);
    for (const conn of everyone) {
      conn.send({ type: "room-ended" });
      this.members.delete(conn);
      conn.close();
    }
    if (room.host) {
      room.host.send({ type: "room-ended" });
      this.members.delete(room.host);
    }
  }

  // ── Guests ────────────────────────────────────────────────────

  private join(conn: Conn, message: Extract<ClientMessage, { type: "join" }>) {
    if (this.members.has(conn)) return this.error(conn, "bad-message", "already in a room");
    const room = this.rooms.get(message.roomId);
    if (!room) return this.error(conn, "room-not-found");
    if (!safeEqual(room.secret, message.secret)) return this.error(conn, "bad-secret");

    const grant = message.rejoinToken ? this.findGrant(room, message.rejoinToken) : undefined;
    if (grant) {
      const current = room.guests.get(grant.guestId);
      if (current) {
        // The old socket hasn't closed yet (overlapping reconnect): replace it atomically.
        this.members.delete(current.conn);
        current.conn.close();
        room.guests.delete(grant.guestId);
      }
      return this.admitGuest(room, { id: grant.guestId, name: message.name, conn });
    }

    if (room.guests.size >= MAX_GUESTS) return this.error(conn, "room-full");
    if (room.pending.size >= MAX_PENDING)
      return this.error(conn, "rate-limited", "too many requests");

    const guest: Guest = { id: newPeerId(), name: message.name, conn };
    guest.pendingTimer = setTimeout(() => {
      if (room.pending.get(guest.id) !== guest) return;
      room.pending.delete(guest.id);
      this.members.delete(conn);
      room.host?.send({ type: "guest-left", guestId: guest.id });
      conn.send({ type: "denied" });
      conn.close();
    }, PENDING_TTL_MS);
    room.pending.set(guest.id, guest);
    this.members.set(conn, { role: "pending", room, guestId: guest.id });
    conn.send({ type: "waiting-for-host", guestId: guest.id });
    room.host?.send({ type: "join-request", guestId: guest.id, name: guest.name });
  }

  private findGrant(room: Room, token: string): RejoinGrant | undefined {
    const now = Date.now();
    for (const grant of room.rejoin.values()) {
      if (grant.expiresAt < now) {
        room.rejoin.delete(grant.guestId);
        continue;
      }
      if (safeEqual(grant.token, token)) return grant;
    }
    return undefined;
  }

  private hostAction(conn: Conn, action: "admit" | "deny" | "kick", guestId: string) {
    this.withHost(conn, (room) => {
      if (action === "kick") {
        // Revoke the rejoin grant first so a kicked guest can't silently come back.
        room.rejoin.delete(guestId);
        const guest = room.guests.get(guestId);
        if (!guest) return this.error(conn, "unknown-peer");
        room.guests.delete(guestId);
        this.members.delete(guest.conn);
        guest.conn.send({ type: "kicked" });
        guest.conn.close();
        conn.send({ type: "guest-left", guestId });
        return;
      }

      const guest = room.pending.get(guestId);
      if (!guest) return this.error(conn, "unknown-peer");
      clearTimeout(guest.pendingTimer);
      room.pending.delete(guestId);

      if (action === "deny") {
        this.members.delete(guest.conn);
        guest.conn.send({ type: "denied" });
        guest.conn.close();
        return;
      }

      if (room.guests.size >= MAX_GUESTS) {
        this.members.delete(guest.conn);
        this.error(guest.conn, "room-full");
        guest.conn.close();
        conn.send({ type: "guest-left", guestId });
        return this.error(conn, "room-full");
      }
      this.admitGuest(room, guest);
    });
  }

  private admitGuest(room: Room, guest: Guest) {
    guest.seq = ++room.admitSeq;
    const rejoinToken = newSecret();
    room.rejoin.set(guest.id, { token: rejoinToken, guestId: guest.id, expiresAt: Infinity });
    room.guests.set(guest.id, guest);
    this.members.set(guest.conn, { role: "guest", room, guestId: guest.id });
    guest.conn.send({
      type: "admitted",
      guestId: guest.id,
      hostId: room.hostId,
      rejoinToken,
      iceServers: this.options.iceServers(),
    });
    room.host?.send({
      type: "guest-joined",
      guestId: guest.id,
      name: guest.name,
      seq: guest.seq,
    });
  }

  // ── Signaling relay ──────────────────────────────────────────

  private signal(
    conn: Conn,
    to: string,
    payload: Extract<ClientMessage, { type: "signal" }>["payload"],
  ) {
    const membership = this.members.get(conn);
    if (!membership || membership.role === "pending") return this.error(conn, "unknown-peer");
    const { room } = membership;

    if (membership.role === "host") {
      const guest = room.guests.get(to);
      if (!guest) return this.error(conn, "unknown-peer");
      return guest.conn.send({ type: "signal", from: room.hostId, payload });
    }

    // Guests may only signal the host; guest-to-guest traffic is relayed by the host.
    if (to !== room.hostId) return this.error(conn, "unknown-peer");
    // While the host is reconnecting, drop silently; it renegotiates after resuming.
    room.host?.send({ type: "signal", from: membership.guestId, payload });
  }

  // ── Helpers ──────────────────────────────────────────────────

  private withHost(conn: Conn, fn: (room: Room) => void) {
    const membership = this.members.get(conn);
    if (membership?.role !== "host") return this.error(conn, "not-host");
    fn(membership.room);
  }

  private broadcastGuests(room: Room, message: ServerMessage) {
    for (const guest of room.guests.values()) guest.conn.send(message);
  }

  private error(conn: Conn, code: ErrorCode, message?: string) {
    conn.send(message ? { type: "error", code, message } : { type: "error", code });
  }
}
