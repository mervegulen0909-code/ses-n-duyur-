import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  getRequestContext: vi.fn(),
}));

// rateLimit passes by default (null = not blocked); one test overrides it.
vi.mock('@/lib/guard', () => ({
  rateLimit: vi.fn(async () => null),
}));

import { rateLimit } from '@/lib/guard';
import { getRequestContext } from '@/lib/supabase/server';
import { POST } from './route';

const PERF = '11111111-1111-1111-1111-111111111111';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/comments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

type RequestCtx = Awaited<ReturnType<typeof getRequestContext>>;

// A ctx whose RLS-scoped client exposes the from().insert().select().single() chain.
function makeCtx(userId = 'me', opts: { insertError?: unknown } = {}) {
  const single = vi.fn(async () => ({
    data: opts.insertError ? null : { id: 'c1', body: 'nice run', created_at: 't0' },
    error: opts.insertError ?? null,
  }));
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ insert }));
  const ctx = { supabase: { from }, user: { id: userId } } as unknown as RequestCtx;
  return { ctx, from, insert };
}

describe('POST /api/comments', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('422 on invalid input (missing body) without touching the DB', async () => {
    const { ctx, from } = makeCtx();
    vi.mocked(getRequestContext).mockResolvedValue(ctx);

    const res = await POST(makeRequest({ performanceId: PERF }));

    expect(res.status).toBe(422);
    expect(from).not.toHaveBeenCalled();
  });

  it('401 when unauthenticated', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(null);

    const res = await POST(makeRequest({ performanceId: PERF, body: 'hi' }));

    expect(res.status).toBe(401);
  });

  it('429 when rate-limited (no insert)', async () => {
    const { ctx, from } = makeCtx();
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(rateLimit).mockResolvedValueOnce(
      Response.json({ error: 'Too many requests' }, { status: 429 }),
    );

    const res = await POST(makeRequest({ performanceId: PERF, body: 'hi' }));

    expect(res.status).toBe(429);
    expect(from).not.toHaveBeenCalled();
  });

  it('201 inserts the comment with the SESSION user id, never a body-supplied one', async () => {
    const { ctx, insert } = makeCtx('me-real');
    vi.mocked(getRequestContext).mockResolvedValue(ctx);

    const res = await POST(
      makeRequest({ performanceId: PERF, body: 'great vibrato', user_id: 'someone-else' }),
    );

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({ ok: true, comment: { id: 'c1' } });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ performance_id: PERF, user_id: 'me-real', body: 'great vibrato' }),
    );
  });

  it('500 when the insert fails', async () => {
    const { ctx } = makeCtx('me', { insertError: { message: 'boom' } });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);

    const res = await POST(makeRequest({ performanceId: PERF, body: 'hi' }));

    expect(res.status).toBe(500);
  });
});
