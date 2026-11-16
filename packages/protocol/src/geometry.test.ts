import { describe, expect, it } from "vitest";
import { contentRect, denormalize, normalizeInRect, sharedContentRect } from "./geometry";

describe("contentRect", () => {
  it("letterboxes a 16:9 video inside a taller element", () => {
    // 800x600 element, 1920x1080 video → 800x450 content, 75px bars top and bottom
    expect(contentRect({ width: 800, height: 600 }, { width: 1920, height: 1080 })).toEqual({
      left: 0,
      top: 75,
      width: 800,
      height: 450,
    });
  });

  it("pillarboxes a 16:9 video inside a wider element", () => {
    expect(contentRect({ width: 2000, height: 900 }, { width: 1600, height: 900 })).toEqual({
      left: 200,
      top: 0,
      width: 1600,
      height: 900,
    });
  });

  it("returns the full element when the video size is unknown", () => {
    expect(contentRect({ width: 640, height: 480 }, { width: 0, height: 0 })).toEqual({
      left: 0,
      top: 0,
      width: 640,
      height: 480,
    });
  });
});

describe("normalizeInRect", () => {
  const rect = { left: 0, top: 75, width: 800, height: 450 };

  it("maps a point inside the content rect to 0..1", () => {
    expect(normalizeInRect({ x: 400, y: 300 }, rect)).toEqual({ x: 0.5, y: 0.5 });
  });

  it("returns null for points in the letterbox bars", () => {
    expect(normalizeInRect({ x: 400, y: 10 }, rect)).toBeNull();
  });

  it("clamps when asked instead of returning null", () => {
    expect(normalizeInRect({ x: 900, y: 10 }, rect, { clamp: true })).toEqual({ x: 1, y: 0 });
  });
});

describe("denormalize", () => {
  it("maps 0..1 back to viewport pixels", () => {
    expect(denormalize({ x: 0.25, y: 0.5 }, { width: 1280, height: 720 })).toEqual({
      x: 320,
      y: 360,
    });
  });
});

describe("sharedContentRect", () => {
  it("matches contentRect when the frame already has the viewport's aspect", () => {
    expect(
      sharedContentRect(
        { width: 800, height: 600 },
        { width: 1920, height: 1080 },
        { width: 1280, height: 720 },
      ),
    ).toEqual({ left: 0, top: 75, width: 800, height: 450 });
  });

  it("accounts for letterboxing inside the captured frame", () => {
    // 4:3 tab captured into a 16:9 frame shown in a 16:9 element → pillarboxed 4:3 area.
    expect(
      sharedContentRect(
        { width: 1600, height: 900 },
        { width: 1920, height: 1080 },
        { width: 1200, height: 900 },
      ),
    ).toEqual({ left: 200, top: 0, width: 1200, height: 900 });
  });
});

describe("degenerate rects", () => {
  it("returns null instead of NaN for zero-sized rects", () => {
    expect(normalizeInRect({ x: 0, y: 0 }, { left: 0, top: 0, width: 0, height: 0 })).toBeNull();
    expect(
      normalizeInRect({ x: 0, y: 0 }, { left: 0, top: 0, width: 0, height: 0 }, { clamp: true }),
    ).toBeNull();
  });
});
