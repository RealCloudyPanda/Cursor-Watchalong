import { describe, expect, it } from "vitest";
import {
  ClientMessage,
  GuestMessage,
  isLikelyDrmHost,
  MAX_MESSAGE_BYTES,
  parseWire,
  requiresControl,
} from "./index";

describe("parseWire", () => {
  it("accepts a valid join message", () => {
    const raw = JSON.stringify({
      type: "join",
      roomId: "abcDEF123456",
      secret: "s".repeat(24),
      name: "  Sam  ",
    });
    const result = parseWire(ClientMessage, raw);
    expect(result).toEqual({
      ok: true,
      value: { type: "join", roomId: "abcDEF123456", secret: "s".repeat(24), name: "Sam" },
    });
  });

  it("rejects oversized payloads before parsing", () => {
    expect(parseWire(ClientMessage, "x".repeat(MAX_MESSAGE_BYTES + 1))).toEqual({
      ok: false,
      error: "too-large",
    });
  });

  it("rejects invalid JSON and unknown message types", () => {
    expect(parseWire(ClientMessage, "{nope").ok).toBe(false);
    expect(parseWire(ClientMessage, JSON.stringify({ type: "sudo" })).ok).toBe(false);
  });

  it("rejects out-of-range cursor coordinates", () => {
    expect(parseWire(GuestMessage, JSON.stringify({ type: "cursor", x: 1.5, y: 0 })).ok).toBe(
      false,
    );
  });
});

describe("requiresControl", () => {
  it("gates page-affecting commands but not pointing or drawing", () => {
    expect(requiresControl({ type: "media", action: "pause" })).toBe(true);
    expect(requiresControl({ type: "pointer", kind: "click", x: 0.1, y: 0.1 })).toBe(true);
    expect(requiresControl({ type: "cursor", x: 0.1, y: 0.1 })).toBe(false);
    expect(requiresControl({ type: "stroke-end", strokeId: "a" })).toBe(false);
  });
});

describe("isLikelyDrmHost", () => {
  it("matches DRM domains and subdomains only", () => {
    expect(isLikelyDrmHost("www.netflix.com")).toBe(true);
    expect(isLikelyDrmHost("netflix.com")).toBe(true);
    expect(isLikelyDrmHost("notnetflix.com")).toBe(false);
    expect(isLikelyDrmHost("www.youtube.com")).toBe(false);
  });
});
