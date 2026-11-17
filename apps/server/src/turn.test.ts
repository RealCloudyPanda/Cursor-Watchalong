import { describe, expect, it, vi } from "vitest";
import { IceProvider, parseIceServers } from "./turn";

describe("parseIceServers", () => {
  it("reads the array response and drops port-53 URLs", () => {
    expect(
      parseIceServers({
        iceServers: [
          { urls: ["stun:stun.cloudflare.com:3478"] },
          {
            urls: [
              "turn:turn.cloudflare.com:3478?transport=udp",
              "turn:turn.cloudflare.com:53?transport=udp",
              "turns:turn.cloudflare.com:443?transport=tcp",
            ],
            username: "u",
            credential: "c",
          },
        ],
      }),
    ).toEqual([
      { urls: ["stun:stun.cloudflare.com:3478"] },
      {
        urls: [
          "turn:turn.cloudflare.com:3478?transport=udp",
          "turns:turn.cloudflare.com:443?transport=tcp",
        ],
        username: "u",
        credential: "c",
      },
    ]);
  });

  it("reads the legacy single-object response", () => {
    expect(
      parseIceServers({ iceServers: { urls: "turn:x:3478", username: "u", credential: "c" } }),
    ).toEqual([{ urls: ["turn:x:3478"], username: "u", credential: "c" }]);
  });

  it("ignores garbage", () => {
    expect(parseIceServers({ iceServers: [{ urls: "http://evil" }, null, 5] })).toEqual([]);
    expect(parseIceServers(null)).toEqual([]);
  });
});

describe("IceProvider", () => {
  it("returns STUN only when TURN is not configured", () => {
    const p = new IceProvider();
    expect(p.turnConfigured).toBe(false);
    expect(JSON.stringify(p.current())).toContain("stun:");
  });

  it("mints TURN credentials and falls back to STUN once they expire", async () => {
    let now = 0;
    const fetchImpl = vi.fn(async () =>
      Response.json({ iceServers: [{ urls: ["turn:t:3478"], username: "u", credential: "c" }] }),
    );
    const p = new IceProvider({
      keyId: "k",
      apiToken: "t",
      ttlSeconds: 60,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => now,
      log: () => {},
    });
    await p.refresh();
    expect(p.current()).toEqual([{ urls: ["turn:t:3478"], username: "u", credential: "c" }]);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toMatchObject({ Authorization: "Bearer t" });

    now = 61_000;
    expect(JSON.stringify(p.current())).toContain("stun:");
  });

  it("keeps serving the last good credentials when a refresh fails", async () => {
    let fail = false;
    const fetchImpl = vi.fn(async () =>
      fail
        ? new Response("nope", { status: 500 })
        : Response.json({
            iceServers: [{ urls: ["turn:t:3478"], username: "u", credential: "c" }],
          }),
    );
    const p = new IceProvider({
      keyId: "k",
      apiToken: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      log: () => {},
    });
    await p.refresh();
    fail = true;
    await p.refresh();
    expect(p.current()[0]?.username).toBe("u");
  });
});
