import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  getRequestContext: vi.fn(),
}));
vi.mock('@/lib/guard', () => ({
  rateLimit: vi.fn(async () => null),
}));

import { rateLimit } from '@/lib/guard';
import { getRequestContext } from '@/lib/supabase/server';
import { POST } from './route';

const PERF = '11111111-1111-1111-1111-111111111111';

type RequestCtx = Awaited<ReturnType<typeof getRequestContext>>;

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/listens/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeCtx(userId = 'me', opts: { insertError?: unknown } = {}) {
  const single = vi.fn(async () => ({
    data: opts.insertError ? null : { id: 'listen-1' },
    error: opts.insertError ?? null,
  }));
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ insert }));
  return { ctx: { supabase: { from }, user: { id: userId } } as unknown as RequestCtx, insert };
}

describe('POST /api/listens/start', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('422 on invalid input (missing performanceId)', async () => {
    expect((await POST(makeRequest({}))).status).toBe(422);
  });

  it('401 when unauthenticated', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(null);
    expect((await POST(makeRequest({ performanceId: PERF }))).status).toBe(401);
  });

  it('429 when rate-limited (no insert)', async () => {
    const { ctx, insert } = makeCtx();
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(rateLimit).mockResolvedValueOnce(Response.json({ error: 'rl' }, { status: 429 }));
    expect((await POST(makeRequest({ performanceId: PERF }))).status).toBe(429);
    expect(insert).not.toHaveBeenCalled();
  });

  it('500 when the insert fails', async () => {
    const { ctx } = makeCtx('me', { insertError: { message: 'x' } });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    expect((await POST(makeRequest({ performanceId: PERF }))).status).toBe(500);
  });

  it('201 creates a session for the SESSION user, forced is_valid=false (no self-validation)', async () => {
    const { ctx, insert } = makeCtx('me-real');
    vi.mocked(getRequestContext).mockResolvedValue(ctx);

    const res = await POST(makeRequest({ performanceId: PERF }));

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ listenId: 'listen-1' });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'me-real', performance_id: PERF, is_valid: false }),
    );
  });
});
