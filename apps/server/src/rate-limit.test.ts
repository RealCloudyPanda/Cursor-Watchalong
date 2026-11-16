import { describe, expect, it } from "vitest";
import { RateLimiter } from "./rate-limit";

describe("RateLimiter", () => {
  it("allows up to the limit per window, then resets", () => {
    const rl = new RateLimiter(2, 1_000);
    expect(rl.allow("ip", 0)).toBe(true);
    expect(rl.allow("ip", 10)).toBe(true);
    expect(rl.allow("ip", 20)).toBe(false);
    expect(rl.allow("other", 20)).toBe(true);
    expect(rl.allow("ip", 1_000)).toBe(true);
  });
});
