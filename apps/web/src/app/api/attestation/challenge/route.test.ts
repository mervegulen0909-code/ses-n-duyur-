import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServiceClient: vi.fn(),
  getRequestContext: vi.fn(),
}));
vi.mock('@/lib/guard', () => ({ rateLimit: vi.fn(async () => null) }));

import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { POST } from './route';

function request(body: unknown): Request {
  return new Request('http://localhost/api/attestation/challenge', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/attestation/challenge', () => {
  afterEach(() => vi.clearAllMocks());

  it('requires authentication and a valid purpose', async () => {
    expect((await POST(request({ purpose: 'wrong' }))).status).toBe(422);
    vi.mocked(getRequestContext).mockResolvedValue(null);
    expect((await POST(request({ purpose: 'assertion' }))).status).toBe(401);
  });

  it('stores and returns a random single-use challenge', async () => {
    vi.mocked(getRequestContext).mockResolvedValue({ user: { id: 'user-1' } } as never);
    const single = vi.fn(async () => ({ data: { id: 'challenge-id' }, error: null }));
    const insert = vi.fn(() => ({ select: () => ({ single }) }));
    vi.mocked(createSupabaseServiceClient).mockReturnValue({
      from: () => ({ insert }),
    } as never);

    const res = await POST(request({ purpose: 'attestation' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ challengeId: 'challenge-id' });
    expect(body.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', purpose: 'attestation' }),
    );
  });
});
