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
const GUEST_1 = 'aaaaaaaa-1111-1111-1111-111111111111';
const GUEST_2 = 'aaaaaaaa-2222-2222-2222-222222222222';
const GUEST_3 = 'aaaaaaaa-3333-3333-3333-333333333333';

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

/**
 * `conversions` = user ids with an invite_converted event for the ref;
 * `validated` = user ids holding ≥1 is_valid verified listen. The
 * verified_listens mock honors the `.in()` ids so the TS intersection
 * in the route is exercised for real.
 */
function makeService(opts: { conversions?: string[]; validated?: string[] } = {}) {
  const from = vi.fn((table: string) => {
    if (table === 'analytics_events') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(async () => ({
              data: (opts.conversions ?? []).map((user_id) => ({ user_id })),
              error: null,
            })),
          })),
        })),
      };
    }
    if (table === 'verified_listens') {
      return {
        select: vi.fn(() => ({
          in: vi.fn((_col: string, ids: string[]) => ({
            eq: vi.fn(async () => ({
              data: (opts.validated ?? [])
                .filter((id) => ids.includes(id))
                .map((user_id) => ({ user_id })),
              error: null,
            })),
          })),
        })),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
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
    const svc = makeService({ conversions: [NEW_USER] });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    const res = await GET(makeRequest({ code: 'abc', refCookie: INVITER }));

    expect(res.headers.get('location')).toBe('http://localhost/');
    expect(trackServer).toHaveBeenCalledWith(svc.service, 'invite_converted', NEW_USER, {
      ref: INVITER,
    });
    expect(grantBadge).not.toHaveBeenCalled(); // below threshold
    expect(res.headers.get('set-cookie')).toContain('vs_ref=;');
  });

  it('grants the inviter badge at 3 VALIDATED conversions (each with a valid listen)', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeSupabase({ id: NEW_USER, created_at: new Date().toISOString() }),
    );
    const svc = makeService({
      conversions: [GUEST_1, GUEST_2, GUEST_3],
      validated: [GUEST_1, GUEST_2, GUEST_3],
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    await GET(makeRequest({ code: 'abc', refCookie: INVITER }));

    expect(grantBadge).toHaveBeenCalledWith(svc.service, INVITER, 'inviter');
  });

  it('withholds the badge when only 2 of 3 conversions completed a valid listen', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeSupabase({ id: NEW_USER, created_at: new Date().toISOString() }),
    );
    const svc = makeService({
      conversions: [GUEST_1, GUEST_2, GUEST_3],
      validated: [GUEST_1, GUEST_2],
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    await GET(makeRequest({ code: 'abc', refCookie: INVITER }));

    expect(grantBadge).not.toHaveBeenCalled();
  });

  it('counts a converted user once even with several valid listens (distinct users)', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeSupabase({ id: NEW_USER, created_at: new Date().toISOString() }),
    );
    const svc = makeService({
      conversions: [GUEST_1, GUEST_2, GUEST_3],
      // GUEST_1 listened valid twice; still only 2 distinct validated users.
      validated: [GUEST_1, GUEST_1, GUEST_2],
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    await GET(makeRequest({ code: 'abc', refCookie: INVITER }));

    expect(grantBadge).not.toHaveBeenCalled();
  });

  it('ignores a RETURNING login (old account) — no conversion', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeSupabase({ id: NEW_USER, created_at: '2026-01-01T00:00:00Z' }),
    );
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeService().service);

    await GET(makeRequest({ code: 'abc', refCookie: INVITER }));

    expect(trackServer).not.toHaveBeenCalled();
  });

  it('ignores self-referral and invalid ref codes', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeSupabase({ id: NEW_USER, created_at: new Date().toISOString() }),
    );
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeService().service);

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
