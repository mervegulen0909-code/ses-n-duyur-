import { afterEach, describe, expect, it, vi } from 'vitest';
import { FailClosedBotCheck, getBotCheck } from './botcheck';
import { FailClosedRateLimiter, getRateLimiter } from './ratelimit';

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
    const limiter = getRateLimiter();
    expect(limiter).toBeInstanceOf(FailClosedRateLimiter);
    await expect(limiter.check('user')).resolves.toEqual({ success: false, remaining: 0 });
  });
});
