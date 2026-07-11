import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}));
vi.mock('@/lib/analytics-server', () => ({
  trackServer: vi.fn(async () => {}),
}));
vi.mock('@/lib/badges', () => ({
  grantBadge: vi.fn(async () => {}),
}));

import { trackServer } from '@/lib/analytics-server';
import { grantBadge } from '@/lib/badges';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server';
import { GET } from './route';

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type Service = ReturnType<typeof createSupabaseServiceClient>;

const INVITER = '11111111-2222-3333-4444-555555555555';
const NEW_USER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function makeRequest(opts: { code?: string; refCookie?: string } = {}): Request {
  const url = `http://localhost/auth/callback${opts.code ? `?code=${opts.code}` : ''}`;
  return new Request(url, {
    headers: opts.refCookie ? { cookie: `vs_ref=${opts.refCookie}` } : {},
  });
}

function makeSupabase(user: { id: string; created_at: string } | null) {
  return {
    auth: {
      exchangeCodeForSession: vi.fn(async () => ({ error: null })),
      getUser: vi.fn(async () => ({ data: { user } })),
    },
  } as unknown as ServerClient;
}

function makeService(conversionCount: number) {
  const eqRef = vi.fn(async () => ({ count: conversionCount }));
  const eqEvent = vi.fn(() => ({ eq: eqRef }));
  const from = vi.fn(() => ({ select: vi.fn(() => ({ eq: eqEvent })) }));
  return { service: { from } as unknown as Service, from };
}

describe('GET /auth/callback — referral attribution', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('redirects to /login?error=oauth without a code', async () => {
    const res = await GET(makeRequest());
    expect(res.headers.get('location')).toContain('/login?error=oauth');
  });

  it('attributes a NEW user with a valid ref cookie and clears the cookie', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeSupabase({ id: NEW_USER, created_at: new Date().toISOString() }),
    );
    const svc = makeService(1);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    const res = await GET(makeRequest({ code: 'abc', refCookie: INVITER }));

    expect(res.headers.get('location')).toBe('http://localhost/');
    expect(trackServer).toHaveBeenCalledWith(svc.service, 'invite_converted', NEW_USER, {
      ref: INVITER,
    });
    expect(grantBadge).not.toHaveBeenCalled(); // below threshold
    expect(res.headers.get('set-cookie')).toContain('vs_ref=;');
  });

  it('grants the inviter badge at the threshold (3rd conversion)', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeSupabase({ id: NEW_USER, created_at: new Date().toISOString() }),
    );
    const svc = makeService(3);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    await GET(makeRequest({ code: 'abc', refCookie: INVITER }));

    expect(grantBadge).toHaveBeenCalledWith(svc.service, INVITER, 'inviter');
  });

  it('ignores a RETURNING login (old account) — no conversion', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeSupabase({ id: NEW_USER, created_at: '2026-01-01T00:00:00Z' }),
    );
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeService(0).service);

    await GET(makeRequest({ code: 'abc', refCookie: INVITER }));

    expect(trackServer).not.toHaveBeenCalled();
  });

  it('ignores self-referral and invalid ref codes', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeSupabase({ id: NEW_USER, created_at: new Date().toISOString() }),
    );
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeService(0).service);

    await GET(makeRequest({ code: 'abc', refCookie: NEW_USER })); // self
    await GET(makeRequest({ code: 'abc', refCookie: 'not-a-uuid' }));

    expect(trackServer).not.toHaveBeenCalled();
  });

  it('sign-in still succeeds when attribution infrastructure is down', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeSupabase({ id: NEW_USER, created_at: new Date().toISOString() }),
    );
    vi.mocked(createSupabaseServiceClient).mockReturnValue(null);

    const res = await GET(makeRequest({ code: 'abc', refCookie: INVITER }));

    expect(res.headers.get('location')).toBe('http://localhost/');
  });

  it('rejects open-redirect payloads in next', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeSupabase(null));
    const res = await GET(new Request('http://localhost/auth/callback?code=abc&next=//evil.com'));
    expect(res.headers.get('location')).toBe('http://localhost/');
  });
});
