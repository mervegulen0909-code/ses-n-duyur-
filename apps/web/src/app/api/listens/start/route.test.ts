import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  getRequestContext: vi.fn(),
}));
vi.mock('@/lib/guard', () => ({
  rateLimit: vi.fn(async () => null),
}));

import { rateLimit } from '@/lib/guard';
import { hashIp } from '@/lib/ip-hash';
import { getRequestContext } from '@/lib/supabase/server';
import { POST } from './route';

const PERF = '11111111-1111-1111-1111-111111111111';

type RequestCtx = Awaited<ReturnType<typeof getRequestContext>>;

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/listens/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function makeCtx(userId = 'me', opts: { insertError?: unknown; openCount?: number } = {}) {
  const single = vi.fn(async () => ({
    data: opts.insertError ? null : { id: 'listen-1' },
    error: opts.insertError ?? null,
  }));
  const insertSelect = vi.fn(() => ({ single }));
  const inserts: Record<string, unknown>[] = [];
  const insert = vi.fn((payload: Record<string, unknown>) => {
    inserts.push(payload);
    return { select: insertSelect };
  });
  // Concurrency probe: select('id', {head}).eq().eq().gt() → { count }
  const countGt = vi.fn(async () => ({ count: opts.openCount ?? 0 }));
  const countSelect = vi.fn(() => ({
    eq: vi.fn(() => ({ eq: vi.fn(() => ({ gt: countGt })) })),
  }));
  const from = vi.fn(() => ({
    insert,
    select: countSelect,
  }));
  return {
    ctx: { supabase: { from }, user: { id: userId } } as unknown as RequestCtx,
    insert,
    inserts,
  };
}

describe('POST /api/listens/start', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => {
    delete process.env.ANTI_ABUSE_SALT;
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

  it('429 when the user already has 3 open listen sessions (parallel-farm guard)', async () => {
    const { ctx, insert } = makeCtx('me', { openCount: 3 });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);

    const res = await POST(makeRequest({ performanceId: PERF }));

    expect(res.status).toBe(429);
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

  it('stores a salted ip_hash of the FIRST forwarded hop when the salt is configured', async () => {
    process.env.ANTI_ABUSE_SALT = 'pepper';
    const { ctx, insert } = makeCtx();
    vi.mocked(getRequestContext).mockResolvedValue(ctx);

    const res = await POST(
      makeRequest({ performanceId: PERF }, { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }),
    );

    expect(res.status).toBe(201);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ ip_hash: hashIp('203.0.113.7', 'pepper') }),
    );
  });

  it('omits ip_hash entirely when the forwarded header is absent (never a raw or empty value)', async () => {
    process.env.ANTI_ABUSE_SALT = 'pepper';
    const { ctx, inserts } = makeCtx();
    vi.mocked(getRequestContext).mockResolvedValue(ctx);

    const res = await POST(makeRequest({ performanceId: PERF }));

    expect(res.status).toBe(201);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).not.toHaveProperty('ip_hash');
  });
});
