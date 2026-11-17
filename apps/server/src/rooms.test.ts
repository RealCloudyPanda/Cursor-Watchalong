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

  it("revokes the rejoin token when a guest is kicked", () => {
    const { host, created } = createRoom();
    const { guest, guestId } = joinAndAdmit(host, created);
    const { rejoinToken } = guest.last("admitted");
    send(host, { type: "kick", guestId });
    const again = new FakeConn();
    send(again, {
      type: "join",
      roomId: created.roomId,
      secret: created.secret,
      name: "Sam",
      rejoinToken,
    });
    expect(again.last("waiting-for-host")).toBeDefined();
    expect(again.sent.some((m) => m.type === "admitted")).toBe(false);
  });

  it("keeps the rejoin token valid for the whole time the guest is connected", () => {
    const { host, created } = createRoom();
    const { guest, guestId } = joinAndAdmit(host, created);
    const { rejoinToken } = guest.last("admitted");
    vi.advanceTimersByTime(60 * 60_000);
    registry.disconnect(guest);
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

  it("replaces a still-open connection when the guest reconnects with its token", () => {
    const { host, created } = createRoom();
    const { guest, guestId } = joinAndAdmit(host, created);
    const { rejoinToken } = guest.last("admitted");
    const again = new FakeConn();
    send(again, {
      type: "join",
      roomId: created.roomId,
      secret: created.secret,
      name: "Sam",
      rejoinToken,
    });
    expect(again.last("admitted").guestId).toBe(guestId);
    expect(guest.closed).toBe(true);
    // The late close of the old socket must not remove the new connection.
    registry.disconnect(guest);
    send(host, { type: "signal", to: guestId, payload: { candidate: null } });
    expect(again.last("signal")).toBeDefined();
  });

  it("tells the host when a pending guest gives up", () => {
    const { host, created } = createRoom();
    const guest = new FakeConn();
    send(guest, { type: "join", roomId: created.roomId, secret: created.secret, name: "Sam" });
    const { guestId } = host.last("join-request");
    registry.disconnect(guest);
    expect(host.last("guest-left").guestId).toBe(guestId);
  });

  it("caps unanswered join requests per room", () => {
    const { created } = createRoom();
    for (let i = 0; i < 8; i++) {
      send(new FakeConn(), {
        type: "join",
        roomId: created.roomId,
        secret: created.secret,
        name: `G${i}`,
      });
    }
    const extra = new FakeConn();
    send(extra, { type: "join", roomId: created.roomId, secret: created.secret, name: "Extra" });
    expect(extra.last("error").code).toBe("rate-limited");
  });

  it("withdraws join requests the host never answers", () => {
    const { host, created } = createRoom();
    const guest = new FakeConn();
    send(guest, { type: "join", roomId: created.roomId, secret: created.secret, name: "Sam" });
    vi.advanceTimersByTime(10 * 60_000);
    expect(guest.last("denied")).toBeDefined();
    expect(host.last("guest-left")).toBeDefined();
  });

  it("gives a resuming host an authoritative snapshot of guests and requests", () => {
    const { host, created } = createRoom();
    const { guest, guestId } = joinAndAdmit(host, created, "Sam");
    const { rejoinToken } = guest.last("admitted");
    registry.disconnect(host);
    registry.disconnect(guest);
    // Guest rejoins while the host is away.
    const again = new FakeConn();
    send(again, {
      type: "join",
      roomId: created.roomId,
      secret: created.secret,
      name: "Sam",
      rejoinToken,
    });
    const waiting = new FakeConn();
    send(waiting, { type: "join", roomId: created.roomId, secret: created.secret, name: "Lee" });

    const host2 = new FakeConn();
    send(host2, { type: "resume-host", roomId: created.roomId, hostToken: created.hostToken });
    const resumed = host2.last("host-resumed");
    expect(resumed.guests).toEqual([{ guestId, name: "Sam", seq: 2 }]);
    expect(resumed.pending.map((p) => p.name)).toEqual(["Lee"]);
  });

  it("rejects resume-host from a socket that already hosts another room", () => {
    const a = createRoom();
    const b = createRoom();
    send(a.host, { type: "resume-host", roomId: b.created.roomId, hostToken: b.created.hostToken });
    expect(a.host.last("error").code).toBe("bad-message");
    send(b.host, { type: "end-room" });
    send(a.host, { type: "end-room" });
    expect(registry.roomCount).toBe(0);
  });

  it("drops guest signals silently while the host is away", () => {
    const { host, created } = createRoom();
    const { guest } = joinAndAdmit(host, created);
    registry.disconnect(host);
    send(guest, { type: "signal", to: created.hostId, payload: { candidate: null } });
    expect(guest.sent.some((m) => m.type === "error")).toBe(false);
  });

  it("requires the host PIN to create a room when one is configured", () => {
    const locked = new RoomRegistry({ iceServers: () => ice, hostPin: "482913" });
    const wrong = new FakeConn();
    locked.handle(wrong, { type: "create-room", name: "Eve", pin: "000000" });
    expect(wrong.last("error").code).toBe("bad-pin");
    const none = new FakeConn();
    locked.handle(none, { type: "create-room", name: "Eve" });
    expect(none.last("error").code).toBe("bad-pin");
    const right = new FakeConn();
    locked.handle(right, { type: "create-room", name: "Ava", pin: "482913" });
    expect(right.last("room-created")).toBeDefined();
    expect(locked.roomCount).toBe(1);
  });

  it("does not ask guests for the PIN", () => {
    const locked = new RoomRegistry({ iceServers: () => ice, hostPin: "482913" });
    const host = new FakeConn();
    locked.handle(host, { type: "create-room", name: "Ava", pin: "482913" });
    const created = host.last("room-created");
    const guest = new FakeConn();
    locked.handle(guest, {
      type: "join",
      roomId: created.roomId,
      secret: created.secret,
      name: "Sam",
    });
    expect(guest.last("waiting-for-host")).toBeDefined();
  });
});
