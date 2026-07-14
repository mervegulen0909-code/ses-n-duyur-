import { afterEach, describe, expect, it, vi } from 'vitest';
import { FailClosedBotCheck, getBotCheck } from './botcheck';
import { FailClosedRateLimiter, UpstashRateLimiter, getRateLimiter } from './ratelimit';

describe('production adapter fallbacks', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('fails bot checks closed when the production secret is missing', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TURNSTILE_SECRET_KEY', '');
    const check = getBotCheck();
    expect(check).toBeInstanceOf(FailClosedBotCheck);
    await expect(check.verify('anything')).resolves.toBe(false);
  });

  it('fails rate limits closed when production Upstash is missing', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    const limiter = getRateLimiter();
    expect(limiter).toBeInstanceOf(FailClosedRateLimiter);
    await expect(limiter.check('user')).resolves.toEqual({ success: false, remaining: 0 });
  });

  it('uses distributed limiting from the Vercel/Upstash KV_* env names', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    vi.stubEnv('KV_REST_API_URL', 'https://example.upstash.io');
    vi.stubEnv('KV_REST_API_TOKEN', 'test-token');
    expect(getRateLimiter()).toBeInstanceOf(UpstashRateLimiter);
  });
});
