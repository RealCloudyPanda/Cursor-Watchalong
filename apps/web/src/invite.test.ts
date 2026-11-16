import { describe, expect, it } from "vitest";
import { parseInvite, wsUrl } from "./invite";

describe("parseInvite", () => {
  it("reads the room id from the path and the secret from the fragment", () => {
    expect(parseInvite({ pathname: "/r/abcDEF123456", hash: "#k=secret-value-123" })).toEqual({
      roomId: "abcDEF123456",
      secret: "secret-value-123",
    });
  });

  it("returns null without a secret or with a bad path", () => {
    expect(parseInvite({ pathname: "/r/abcDEF123456", hash: "" })).toBeNull();
    expect(parseInvite({ pathname: "/", hash: "#k=x" })).toBeNull();
  });
});

describe("wsUrl", () => {
  it("uses wss on https", () => {
    expect(wsUrl({ protocol: "https:", host: "watch.example" })).toBe("wss://watch.example/ws");
    expect(wsUrl({ protocol: "http:", host: "localhost:5173" })).toBe("ws://localhost:5173/ws");
  });
});
