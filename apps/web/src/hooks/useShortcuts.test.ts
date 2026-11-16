import { describe, expect, it } from "vitest";
import { shortcutToCommand } from "./useShortcuts";

describe("shortcutToCommand", () => {
  it("maps YouTube-style keys to media commands", () => {
    expect(shortcutToCommand(" ", false)).toEqual({ type: "media", action: "toggle" });
    expect(shortcutToCommand("k", false)).toEqual({ type: "media", action: "toggle" });
    expect(shortcutToCommand("j", false)).toEqual({ type: "media", action: "seekBy", value: -10 });
    expect(shortcutToCommand("L", false)).toEqual({ type: "media", action: "seekBy", value: 10 });
    expect(shortcutToCommand("ArrowLeft", false)).toEqual({
      type: "media",
      action: "seekBy",
      value: -5,
    });
  });

  it("toggles mute based on current state", () => {
    expect(shortcutToCommand("m", false)?.action).toBe("mute");
    expect(shortcutToCommand("m", true)?.action).toBe("unmute");
  });

  it("ignores other keys", () => {
    expect(shortcutToCommand("x", false)).toBeNull();
  });
});
