import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  getRequestContext: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  getProfileForContext: vi.fn(),
}));

import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { getProfileForContext } from '@/lib/auth';
import { GET } from './route';

type RequestCtx = Awaited<ReturnType<typeof getRequestContext>>;
type Service = ReturnType<typeof createSupabaseServiceClient>;
type Profile = Awaited<ReturnType<typeof getProfileForContext>>;

function makeRequest(query = ''): Request {
  return new Request(`http://localhost/api/admin/analytics/summary${query}`);
}

/**
 * Service stub returning fixed head-counts: every analytics_events count is
 * keyed by event, every performance_requests count by category. Unlisted
 * keys count 0.
 */
function makeService(counts: Record<string, number>): Service {
  const from = vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn((_col: string, value: string) => ({
        gte: vi.fn(async () => ({ count: counts[value] ?? 0 })),
      })),
    })),
  }));
  return { from } as unknown as Service;
}

function mockAdmin(role: 'admin' | 'user') {
  vi.mocked(getRequestContext).mockResolvedValue({
    supabase: {},
    user: { id: 'u1' },
  } as unknown as RequestCtx);
  vi.mocked(getProfileForContext).mockResolvedValue({
    id: 'u1',
    handle: 'boss',
    role,
  } as Profile);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('GET /api/admin/analytics/summary', () => {
  it('403 when unauthenticated', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(null);
    expect((await GET(makeRequest())).status).toBe(403);
  });

  it('403 when not an admin', async () => {
    mockAdmin('user');
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
    expect(createSupabaseServiceClient).not.toHaveBeenCalled();
  });

  it('422 on an out-of-range days param', async () => {
    mockAdmin('admin');
    expect((await GET(makeRequest('?days=0'))).status).toBe(422);
    expect((await GET(makeRequest('?days=365'))).status).toBe(422);
    expect((await GET(makeRequest('?days=soon'))).status).toBe(422);
  });

  it('200 returns aggregates only, with derived rates', async () => {
    mockAdmin('admin');
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeService({
        landing_view: 100,
        signup_completed: 10,
        share_clicked: 20,
        invite_converted: 5,
        pop: 4,
        rock: 1,
      }),
    );

    const res = await GET(makeRequest('?days=7'));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.days).toBe(7);
    expect(body.funnel.landing_view).toBe(100);
    expect(body.funnel.vote_submitted).toBe(0);
    expect(body.virality).toEqual({
      sharesClicked: 20,
      invitesConverted: 5,
      signupsCompleted: 10,
      inviteConversionRate: 0.25,
      viralCoefficient: 0.5,
    });
    // Nonzero only, most-requested first — never raw event rows.
    expect(body.topCategories).toEqual([
      { category: 'pop', count: 4 },
      { category: 'rock', count: 1 },
    ]);
    expect(body).not.toHaveProperty('events');
  });

  it('200 with null rates when there are no shares/signups', async () => {
    mockAdmin('admin');
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeService({}));

    const body = await (await GET(makeRequest())).json();
    expect(body.days).toBe(30);
    expect(body.virality.inviteConversionRate).toBeNull();
    expect(body.virality.viralCoefficient).toBeNull();
    expect(body.topCategories).toEqual([]);
  });
});
