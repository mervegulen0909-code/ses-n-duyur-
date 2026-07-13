import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServiceClient: vi.fn(),
  getRequestContext: vi.fn(),
}));
vi.mock('@/lib/guard', () => ({ rateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/seasons', () => ({ currentSeasonId: vi.fn(async () => null) }));

import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { GET } from './route';

describe('GET /api/leagues/[id]', () => {
  afterEach(() => vi.clearAllMocks());

  it('does not reveal a private league to a non-member', async () => {
    vi.mocked(getRequestContext).mockResolvedValue({ user: { id: 'outsider' } } as never);
    vi.mocked(createSupabaseServiceClient).mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
        }),
      }),
    } as never);

    const res = await GET(new Request('http://localhost/api/leagues/private'), {
      params: Promise.resolve({ id: 'private' }),
    });
    expect(res.status).toBe(404);
  });
});
