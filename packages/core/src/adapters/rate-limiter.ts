export interface RateLimitResult {
  readonly success: boolean;
  readonly remaining: number;
}

export interface RateLimiter {
  /** Returns whether `key` may proceed, and how many requests remain. */
  check(key: string): Promise<RateLimitResult>;
}

/**
 * InMemoryRateLimiter — fixed-window limiter for development/tests. NOT for
 * multi-instance production (state is per-process). Faz J swaps in an
 * UpstashRateLimiter behind the same interface.
 *
 * `now` is injectable so window expiry is testable without real timers.
 */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {
    if (limit <= 0) throw new RangeError('limit must be > 0');
    if (windowMs <= 0) throw new RangeError('windowMs must be > 0');
  }

  async check(key: string): Promise<RateLimitResult> {
    const t = this.now();
    const entry = this.hits.get(key);

    if (!entry || t >= entry.resetAt) {
      this.hits.set(key, { count: 1, resetAt: t + this.windowMs });
      return { success: true, remaining: this.limit - 1 };
    }

    if (entry.count >= this.limit) {
      return { success: false, remaining: 0 };
    }

    entry.count += 1;
    return { success: true, remaining: this.limit - entry.count };
  }
}
