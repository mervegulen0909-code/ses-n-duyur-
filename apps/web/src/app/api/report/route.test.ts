import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Authed user files a moderation flag. getRequestContext resolves the session
// user; rateLimit is keyed on that user id.
vi.mock('@/lib/supabase/server', () => ({
  getRequestContext: vi.fn(),
}));
vi.mock('@/lib/guard', () => ({
  rateLimit: vi.fn(async () => null),
}));

import { rateLimit } from '@/lib/guard';
import { getRequestContext } from '@/lib/supabase/server';
import { POST } from './route';

const TARGET = '11111111-1111-1111-1111-111111111111';

type RequestCtx = Awaited<ReturnType<typeof getRequestContext>>;

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/report', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeBadRequest(): Request {
  return new Request('http://localhost/api/report', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: 'not json',
  });
}

const validBody = { targetType: 'performance', targetId: TARGET, reason: 'spam content' };

function makeCtx(userId = 'me', opts: { insertError?: unknown } = {}) {
  const insert = vi.fn(async () => ({ error: opts.insertError ?? null }));
  const from = vi.fn(() => ({ insert }));
  return { ctx: { supabase: { from }, user: { id: userId } } as unknown as RequestCtx, insert };
}

describe('POST /api/report — authed moderation reports', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('400 on a non-JSON body', async () => {
    expect((await POST(makeBadRequest())).status).toBe(400);
  });

  it('422 on invalid input (reason too short)', async () => {
    expect(
      (await POST(makeRequest({ targetType: 'performance', targetId: TARGET, reason: 'x' })))
        .status,
    ).toBe(422);
  });

  it('401 when unauthenticated', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(null);
    expect((await POST(makeRequest(validBody))).status).toBe(401);
  });

  it('429 when rate-limited (and files nothing)', async () => {
    const { ctx, insert } = makeCtx();
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(rateLimit).mockResolvedValueOnce(Response.json({ error: 'rl' }, { status: 429 }));
    expect((await POST(makeRequest(validBody))).status).toBe(429);
    expect(insert).not.toHaveBeenCalled();
  });

  it('500 when the insert fails', async () => {
    const { ctx } = makeCtx('me', { insertError: { message: 'boom' } });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    expect((await POST(makeRequest(validBody))).status).toBe(500);
  });

  it('201, recording the reporter from the SESSION (not the body)', async () => {
    const { ctx, insert } = makeCtx('me-real');
    vi.mocked(getRequestContext).mockResolvedValue(ctx);

    const res = await POST(makeRequest({ ...validBody, reporterId: 'spoofed' }));

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({ ok: true });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        target_type: 'performance',
        target_id: TARGET,
        reporter_id: 'me-real',
        reason: 'spam content',
      }),
    );
  });
});
