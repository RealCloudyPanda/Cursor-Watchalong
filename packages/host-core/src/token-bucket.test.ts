import { describe, expect, it } from "vitest";
import { TokenBucket } from "./token-bucket";

describe("TokenBucket", () => {
  it("allows a burst then refills at the sustained rate", () => {
    const b = new TokenBucket(10, 3, 0);
    expect([b.take(0), b.take(0), b.take(0), b.take(0)]).toEqual([true, true, true, false]);
    expect(b.take(100)).toBe(true); // 0.1s → 1 token
    expect(b.take(100)).toBe(false);
  });

  it("never exceeds the burst size after a long idle", () => {
    const b = new TokenBucket(10, 2, 0);
    b.take(0);
    b.take(0);
    expect([b.take(60_000), b.take(60_000), b.take(60_000)]).toEqual([true, true, false]);
  });
});
