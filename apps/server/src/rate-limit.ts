/** Fixed-window counter per key, in memory. */
export class RateLimiter {
  private windows = new Map<string, { start: number; count: number }>();

  constructor(
    private limit: number,
    private windowMs: number,
  ) {}

  allow(key: string, now = Date.now()): boolean {
    const w = this.windows.get(key);
    if (!w || now - w.start >= this.windowMs) {
      this.windows.set(key, { start: now, count: 1 });
      if (this.windows.size > 10_000) this.sweep(now);
      return true;
    }
    w.count += 1;
    return w.count <= this.limit;
  }

  /** Forget windows that have expired, so keys (IP addresses) aren't kept around. */
  sweep(now = Date.now()) {
    for (const [key, w] of this.windows) {
      if (now - w.start >= this.windowMs) this.windows.delete(key);
    }
  }
}
