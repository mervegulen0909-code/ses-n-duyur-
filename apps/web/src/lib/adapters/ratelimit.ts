import 'server-only';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { InMemoryRateLimiter, type RateLimiter, type RateLimitResult } from '@voxscore/core';

/**
 * Resolve Upstash REST credentials from the environment, accepting BOTH the
 * canonical Upstash names (`UPSTASH_REDIS_REST_URL` / `_TOKEN`) and the names
 * the Vercel Marketplace "Upstash for Redis" integration injects
 * (`KV_REST_API_URL` / `KV_REST_API_TOKEN`). Returns null when neither pair is
 * fully set, so callers can fall back deliberately.
 */
export function resolveUpstashCreds(): { url: string; token: string } | null {
  // `||` (not `??`) so an EMPTY string — how an unset var can surface in some
  // runtimes — also falls through to the Vercel-injected KV_* names.
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

/**
 * UpstashRateLimiter — distributed fixed-window limiter for production (works
 * across serverless instances). Activated by getRateLimiter() only when the
 * Upstash env is set; otherwise the in-memory dev limiter is used.
 */
export class UpstashRateLimiter implements RateLimiter {
  private readonly rl: Ratelimit;

  constructor(limit: number, windowMs: number, creds: { url: string; token: string }) {
    this.rl = new Ratelimit({
      redis: new Redis({ url: creds.url, token: creds.token }),
      limiter: Ratelimit.fixedWindow(limit, `${windowMs} ms`),
      prefix: 'vl-rl',
    });
  }

  async check(key: string): Promise<RateLimitResult> {
    const { success, remaining } = await this.rl.limit(key);
    return { success, remaining };
  }
}

/** Missing distributed rate limiting is a deployment error, not a bypass. */
export class FailClosedRateLimiter implements RateLimiter {
  async check(): Promise<RateLimitResult> {
    return { success: false, remaining: 0 };
  }
}

export function getRateLimiter(limit = 20, windowMs = 60_000): RateLimiter {
  const creds = resolveUpstashCreds();
  if (creds) {
    return new UpstashRateLimiter(limit, windowMs, creds);
  }
  // apps/web/e2e/authenticated-flows.spec.ts runs against a PRODUCTION build
  // (`next start`, NODE_ENV=production — see apps/web/playwright.config.ts)
  // with no Upstash configured, so without this the fail-closed limiter would
  // 429 every mutating call the E2E suite makes. E2E_IN_MEMORY_RATE_LIMIT is
  // set ONLY by that Playwright webServer config — never by a real deployment
  // — so production's fail-closed stance ("missing distributed rate limiting
  // is a deployment error, not a bypass") is unchanged outside of E2E.
  if (process.env.E2E_IN_MEMORY_RATE_LIMIT === '1') {
    return new InMemoryRateLimiter(limit, windowMs);
  }
  return process.env.NODE_ENV === 'production'
    ? new FailClosedRateLimiter()
    : new InMemoryRateLimiter(limit, windowMs);
}
