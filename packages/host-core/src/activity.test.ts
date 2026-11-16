import { describe, expect, it } from "vitest";
import { describeMediaAction } from "./activity";

const state = {
  hasVideo: true,
  paused: false,
  muted: false,
  currentTime: 10,
  duration: 100,
  playbackRate: 1,
};

describe("describeMediaAction", () => {
  it("resolves toggle against the current state", () => {
    expect(describeMediaAction({ type: "media", action: "toggle" }, state)).toBe("paused");
    expect(
      describeMediaAction({ type: "media", action: "toggle" }, { ...state, paused: true }),
    ).toBe("played");
  });

  it("formats seeks", () => {
    expect(describeMediaAction({ type: "media", action: "seek", value: 201 }, state)).toBe(
      "skipped to 3:21",
    );
    expect(describeMediaAction({ type: "media", action: "seekBy", value: -10 }, state)).toBe(
      "went back 10s",
    );
  });
});
