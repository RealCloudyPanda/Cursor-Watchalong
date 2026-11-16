/** Classic token bucket: `ratePerSec` sustained, bursts up to `burst`. */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private ratePerSec: number,
    private burst = ratePerSec,
    now = Date.now(),
  ) {
    this.tokens = burst;
    this.last = now;
  }

  take(now = Date.now()): boolean {
    const elapsed = Math.max(0, now - this.last) / 1000;
    this.last = now;
    this.tokens = Math.min(this.burst, this.tokens + elapsed * this.ratePerSec);
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
