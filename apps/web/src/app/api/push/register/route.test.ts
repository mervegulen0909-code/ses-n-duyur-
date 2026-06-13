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

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/push/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

type RequestCtx = Awaited<ReturnType<typeof getRequestContext>>;

// A ctx whose RLS-scoped client exposes the from().upsert() chain.
function makeCtx(userId = 'me', opts: { upsertError?: unknown } = {}) {
  const upsert = vi.fn(async () => ({ error: opts.upsertError ?? null }));
  const from = vi.fn(() => ({ upsert }));
  const ctx = { supabase: { from }, user: { id: userId } } as unknown as RequestCtx;
  return { ctx, from, upsert };
}

const validBody = { token: 'ExponentPushToken[abc123]', platform: 'ios' };

describe('POST /api/push/register', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('422 on invalid input (bad platform) without touching the DB', async () => {
    const { ctx, from } = makeCtx();
    vi.mocked(getRequestContext).mockResolvedValue(ctx);

    const res = await POST(makeRequest({ token: 'x', platform: 'web' }));

    expect(res.status).toBe(422);
    expect(from).not.toHaveBeenCalled();
  });

  it('401 when unauthenticated', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(null);
    expect((await POST(makeRequest(validBody))).status).toBe(401);
  });

  it('429 when rate-limited (no upsert)', async () => {
    const { ctx, from } = makeCtx();
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(rateLimit).mockResolvedValueOnce(
      Response.json({ error: 'Too many requests' }, { status: 429 }),
    );

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(429);
    expect(from).not.toHaveBeenCalled();
  });

  it('201 upserts the token for the SESSION user, never a body-supplied id', async () => {
    const { ctx, upsert } = makeCtx('me-real');
    vi.mocked(getRequestContext).mockResolvedValue(ctx);

    const res = await POST(makeRequest({ ...validBody, user_id: 'someone-else' }));

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({ ok: true });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'me-real', token: validBody.token, platform: 'ios' }),
      expect.objectContaining({ onConflict: 'user_id,token' }),
    );
  });

  it('500 when the upsert fails', async () => {
    const { ctx } = makeCtx('me', { upsertError: { message: 'boom' } });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    expect((await POST(makeRequest(validBody))).status).toBe(500);
  });
});
