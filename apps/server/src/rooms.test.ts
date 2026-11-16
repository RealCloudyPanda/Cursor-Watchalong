import type { ClientMessage, ServerMessage } from "@watchalong/protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type Conn, RoomRegistry } from "./rooms";

class FakeConn implements Conn {
  sent: ServerMessage[] = [];
  closed = false;
  send(msg: ServerMessage) {
    this.sent.push(msg);
  }
  close() {
    this.closed = true;
  }
  last<T extends ServerMessage["type"]>(type: T) {
    return this.sent.findLast((m) => m.type === type) as Extract<ServerMessage, { type: T }>;
  }
}

let registry: RoomRegistry;
const ice = [{ urls: "stun:stun.example:3478" }];

beforeEach(() => {
  vi.useFakeTimers();
  registry = new RoomRegistry({ iceServers: () => ice });
});

function send(conn: FakeConn, msg: ClientMessage) {
  registry.handle(conn, msg);
}

function createRoom() {
  const host = new FakeConn();
  send(host, { type: "create-room", name: "Host" });
  return { host, created: host.last("room-created") };
}

function joinAndAdmit(
  host: FakeConn,
  created: ReturnType<typeof createRoom>["created"],
  name = "Sam",
) {
  const guest = new FakeConn();
  send(guest, { type: "join", roomId: created.roomId, secret: created.secret, name });
  const { guestId } = host.last("join-request");
  send(host, { type: "admit", guestId });
  return { guest, guestId };
}

describe("RoomRegistry", () => {
  it("creates a room and returns credentials and ICE servers to the host", () => {
    const { created } = createRoom();
    expect(created.roomId).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(created.iceServers).toEqual(ice);
    expect(registry.roomCount).toBe(1);
  });

  it("requires host approval before a guest is admitted", () => {
    const { host, created } = createRoom();
    const guest = new FakeConn();
    send(guest, { type: "join", roomId: created.roomId, secret: created.secret, name: "Sam" });

    expect(guest.last("waiting-for-host")).toBeDefined();
    const req = host.last("join-request");
    expect(req.name).toBe("Sam");

    send(host, { type: "admit", guestId: req.guestId });
    const admitted = guest.last("admitted");
    expect(admitted).toMatchObject({ guestId: req.guestId, hostId: created.hostId });
    expect(host.last("guest-joined").guestId).toBe(req.guestId);
  });

  it("rejects a wrong secret without telling the host", () => {
    const { host, created } = createRoom();
    const guest = new FakeConn();
    send(guest, { type: "join", roomId: created.roomId, secret: "x".repeat(24), name: "Eve" });
    expect(guest.last("error").code).toBe("bad-secret");
    expect(host.sent.some((m) => m.type === "join-request")).toBe(false);
  });

  it("sends denied and closes a denied guest", () => {
    const { host, created } = createRoom();
    const guest = new FakeConn();
    send(guest, { type: "join", roomId: created.roomId, secret: created.secret, name: "Sam" });
    send(host, { type: "deny", guestId: host.last("join-request").guestId });
    expect(guest.last("denied")).toBeDefined();
    expect(guest.closed).toBe(true);
  });

  it("only lets the host admit", () => {
    const { host, created } = createRoom();
    const { guest } = joinAndAdmit(host, created);
    const other = new FakeConn();
    send(other, { type: "join", roomId: created.roomId, secret: created.secret, name: "Lee" });
    send(guest, { type: "admit", guestId: host.last("join-request").guestId });
    expect(guest.last("error").code).toBe("not-host");
    expect(other.sent.some((m) => m.type === "admitted")).toBe(false);
  });

  it("caps rooms at four admitted guests", () => {
    const { host, created } = createRoom();
    for (const name of ["A", "B", "C", "D"]) joinAndAdmit(host, created, name);
    const fifth = new FakeConn();
    send(fifth, { type: "join", roomId: created.roomId, secret: created.secret, name: "E" });
    expect(fifth.last("error").code).toBe("room-full");
  });

  it("relays signals between host and guest with the sender stamped", () => {
    const { host, created } = createRoom();
    const { guest, guestId } = joinAndAdmit(host, created);
    const payload = { description: { type: "offer" as const, sdp: "v=0" } };

    send(host, { type: "signal", to: guestId, payload });
    expect(guest.last("signal")).toEqual({ type: "signal", from: created.hostId, payload });

    send(guest, { type: "signal", to: created.hostId, payload });
    expect(host.last("signal")).toEqual({ type: "signal", from: guestId, payload });
  });

  it("does not let guests signal each other", () => {
    const { host, created } = createRoom();
    const a = joinAndAdmit(host, created, "A");
    const b = joinAndAdmit(host, created, "B");
    send(a.guest, { type: "signal", to: b.guestId, payload: { candidate: null } });
    expect(a.guest.last("error").code).toBe("unknown-peer");
    expect(b.guest.sent.some((m) => m.type === "signal")).toBe(false);
  });

  it("ends the room for everyone when the host ends it", () => {
    const { host, created } = createRoom();
    const { guest } = joinAndAdmit(host, created);
    send(host, { type: "end-room" });
    expect(guest.last("room-ended")).toBeDefined();
    expect(guest.closed).toBe(true);
    expect(registry.roomCount).toBe(0);
  });

  it("keeps the room for the grace period when the host drops, then ends it", () => {
    const { host, created } = createRoom();
    const { guest } = joinAndAdmit(host, created);
    registry.disconnect(host);
    expect(guest.last("host-away").graceMs).toBe(30_000);
    expect(registry.roomCount).toBe(1);

    vi.advanceTimersByTime(30_000);
    expect(guest.last("room-ended")).toBeDefined();
    expect(registry.roomCount).toBe(0);
  });

  it("lets the host resume within the grace period", () => {
    const { host, created } = createRoom();
    const { guest } = joinAndAdmit(host, created);
    registry.disconnect(host);

    const host2 = new FakeConn();
    send(host2, { type: "resume-host", roomId: created.roomId, hostToken: created.hostToken });
    expect(host2.last("host-resumed")).toBeDefined();
    expect(guest.last("host-back")).toBeDefined();

    vi.advanceTimersByTime(60_000);
    expect(registry.roomCount).toBe(1);
  });

  it("lets a guest rejoin with its token without re-approval", () => {
    const { host, created } = createRoom();
    const { guest, guestId } = joinAndAdmit(host, created);
    const { rejoinToken } = guest.last("admitted");
    registry.disconnect(guest);
    expect(host.last("guest-left").guestId).toBe(guestId);

    const again = new FakeConn();
    send(again, {
      type: "join",
      roomId: created.roomId,
      secret: created.secret,
      name: "Sam",
      rejoinToken,
    });
    expect(again.last("admitted").guestId).toBe(guestId);
  });

  it("expires rejoin tokens after five minutes", () => {
    const { host, created } = createRoom();
    const { guest } = joinAndAdmit(host, created);
    const { rejoinToken } = guest.last("admitted");
    registry.disconnect(guest);
    vi.advanceTimersByTime(5 * 60_000 + 1);

    const again = new FakeConn();
    send(again, {
      type: "join",
      roomId: created.roomId,
      secret: created.secret,
      name: "Sam",
      rejoinToken,
    });
    expect(again.last("waiting-for-host")).toBeDefined();
  });
});
