/** Small in-memory sliding-window rate limiter, per client address. */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Record a request; returns 0 when allowed, else the seconds to wait. */
  take(key: string): number {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((h) => t - h < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return Math.max(1, Math.ceil((recent[0]! + this.windowMs - t) / 1000));
    }
    recent.push(t);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) if (!v.some((h) => t - h < this.windowMs)) this.hits.delete(k);
    }
    return 0;
  }
}
