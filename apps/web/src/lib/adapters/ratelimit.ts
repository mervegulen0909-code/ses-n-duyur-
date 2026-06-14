import 'server-only';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { InMemoryRateLimiter, type RateLimiter, type RateLimitResult } from '@voxscore/core';

/**
 * UpstashRateLimiter — distributed fixed-window limiter for production (works
 * across serverless instances). Activated by getRateLimiter() only when the
 * Upstash env is set; otherwise the in-memory dev limiter is used.
 */
export class UpstashRateLimiter implements RateLimiter {
  private readonly rl: Ratelimit;

  constructor(limit: number, windowMs: number) {
    this.rl = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.fixedWindow(limit, `${windowMs} ms`),
      prefix: 'vl-rl',
    });
  }

  async check(key: string): Promise<RateLimitResult> {
    const { success, remaining } = await this.rl.limit(key);
    return { success, remaining };
  }
}

export function getRateLimiter(limit = 20, windowMs = 60_000): RateLimiter {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return new UpstashRateLimiter(limit, windowMs);
  }
  return new InMemoryRateLimiter(limit, windowMs);
}
