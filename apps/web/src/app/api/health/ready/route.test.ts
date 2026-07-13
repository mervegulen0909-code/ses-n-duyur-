import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServiceClient: vi.fn() }));
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { GET } from './route';

const ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
  'TURNSTILE_SECRET_KEY',
  'CRON_SECRET',
  'ANTI_ABUSE_SALT',
  'ANTHROPIC_API_KEY',
] as const;

describe('GET /api/health/ready', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('returns 503 with missing env names but no values', async () => {
    for (const name of ENV) vi.stubEnv(name, '');
    const res = await GET();
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ ready: false, missing: expect.any(Array) });
  });

  it('checks database connectivity before declaring ready', async () => {
    for (const name of ENV) vi.stubEnv(name, 'configured');
    vi.mocked(createSupabaseServiceClient).mockReturnValue({
      from: () => ({ select: () => ({ limit: async () => ({ error: null }) }) }),
    } as never);
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ready: true });
  });

  it('lists every native verification setting required in production', async () => {
    for (const name of ENV) vi.stubEnv(name, 'configured');
    vi.stubEnv('NODE_ENV', 'production');
    for (const name of [
      'GOOGLE_PLAY_PACKAGE_NAME',
      'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64',
      'GOOGLE_PLAY_CERT_SHA256',
      'APPLE_TEAM_ID',
      'APPLE_BUNDLE_ID',
      'APP_ATTEST_ENVIRONMENT',
    ]) {
      vi.stubEnv(name, '');
    }

    const res = await GET();
    expect(res.status).toBe(503);
    const body = (await res.json()) as { missing: string[] };
    expect(body.missing).toEqual(
      expect.arrayContaining([
        'GOOGLE_PLAY_PACKAGE_NAME',
        'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64',
        'GOOGLE_PLAY_CERT_SHA256',
        'APPLE_TEAM_ID',
        'APPLE_BUNDLE_ID',
        'APP_ATTEST_ENVIRONMENT',
      ]),
    );
  });
});
