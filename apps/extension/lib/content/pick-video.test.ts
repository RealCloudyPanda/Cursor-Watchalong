import { describe, expect, it } from "vitest";
import { pickMainVideo } from "./pick-video";

describe("pickMainVideo", () => {
  it("prefers the largest visible video", () => {
    expect(
      pickMainVideo([
        { visibleArea: 200 * 100, playing: true, hasSource: true },
        { visibleArea: 1280 * 720, playing: false, hasSource: true },
      ]),
    ).toBe(1);
  });

  it("breaks near-ties in favor of the playing video", () => {
    expect(
      pickMainVideo([
        { visibleArea: 1000 * 560, playing: false, hasSource: true },
        { visibleArea: 960 * 540, playing: true, hasSource: true },
      ]),
    ).toBe(1);
  });

  it("ignores tiny, off-screen and source-less videos", () => {
    expect(
      pickMainVideo([
        { visibleArea: 10 * 10, playing: true, hasSource: true },
        { visibleArea: 0, playing: true, hasSource: true },
        { visibleArea: 1280 * 720, playing: false, hasSource: false },
      ]),
    ).toBe(-1);
  });
});
