import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServiceClient: vi.fn(),
  getRequestContext: vi.fn(),
}));
vi.mock('@/lib/guard', () => ({
  rateLimit: vi.fn(async () => null),
  botGuard: vi.fn(async () => null),
}));

import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { POST } from './route';

function req(code: string): Request {
  return new Request('http://localhost/api/leagues/join', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

function service(insertError: unknown = null, league: { id: string } | null = { id: 'league-1' }) {
  return {
    from: (table: string) =>
      table === 'custom_leagues'
        ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: league }) }) }) }
        : { insert: async () => ({ error: insertError }) },
  };
}

describe('POST /api/leagues/join', () => {
  afterEach(() => vi.clearAllMocks());

  it('validates the code and requires auth', async () => {
    expect((await POST(req('bad'))).status).toBe(422);
    vi.mocked(getRequestContext).mockResolvedValue(null);
    expect((await POST(req('ABCDEFG2'))).status).toBe(401);
  });

  it('returns 404 for an unknown private code', async () => {
    vi.mocked(getRequestContext).mockResolvedValue({ user: { id: 'user-1' } } as never);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service(null, null) as never);
    expect((await POST(req('ABCDEFG2'))).status).toBe(404);
  });

  it('joins once and rejects duplicates', async () => {
    vi.mocked(getRequestContext).mockResolvedValue({ user: { id: 'user-1' } } as never);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service() as never);
    expect((await POST(req('abcdefg2'))).status).toBe(201);

    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      service({ code: '23505', message: 'duplicate' }) as never,
    );
    expect((await POST(req('ABCDEFG2'))).status).toBe(409);
  });
});
