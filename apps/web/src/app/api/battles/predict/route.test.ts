import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  getRequestContext: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}));
vi.mock('@/lib/guard', () => ({
  rateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/analytics-server', () => ({
  trackServer: vi.fn(async () => {}),
}));

import { rateLimit } from '@/lib/guard';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { trackServer } from '@/lib/analytics-server';
import { POST } from './route';

const BATTLE = '11111111-1111-1111-1111-111111111111';
const PERF_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

type RequestCtx = Awaited<ReturnType<typeof getRequestContext>>;
type Service = ReturnType<typeof createSupabaseServiceClient>;

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/battles/predict', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const validBody = { battleId: BATTLE, predictedWinnerId: PERF_A };

function makeCtx(userId = 'me', opts: { insertError?: unknown } = {}) {
  const insert = vi.fn(async () => ({ error: opts.insertError ?? null }));
  const from = vi.fn((table: string) => {
    if (table === 'battle_predictions') return { insert };
    return {};
  });
  return {
    ctx: { supabase: { from }, user: { id: userId } } as unknown as RequestCtx,
    insert,
  };
}

describe('POST /api/battles/predict — a game commitment, NOT a vote', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('400 on unparseable JSON', async () => {
    expect((await POST(makeRequest('{nope'))).status).toBe(400);
  });

  it('422 on invalid input', async () => {
    expect((await POST(makeRequest({ battleId: BATTLE }))).status).toBe(422);
    expect(
      (await POST(makeRequest({ battleId: BATTLE, predictedWinnerId: 'perf-a' }))).status,
    ).toBe(422);
  });

  it('401 when unauthenticated', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(null);
    expect((await POST(makeRequest(validBody))).status).toBe(401);
  });

  it('429 when rate-limited', async () => {
    const { ctx } = makeCtx();
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(rateLimit).mockResolvedValueOnce(Response.json({ error: 'rl' }, { status: 429 }));
    expect((await POST(makeRequest(validBody))).status).toBe(429);
  });

  it('201, inserting AS THE USER with the SESSION user id (never from the body)', async () => {
    const { ctx, insert } = makeCtx('me');
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    const service = { from: vi.fn() } as unknown as Service;
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service);

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(insert).toHaveBeenCalledWith({
      battle_id: BATTLE,
      user_id: 'me',
      predicted: PERF_A,
    });
    expect(trackServer).toHaveBeenCalledWith(service, 'prediction_submitted', 'me', {});
  });

  it('409 when RLS rejects (duplicate, closed battle, or pick outside the pair)', async () => {
    const { ctx } = makeCtx('me', { insertError: { message: 'rls' } });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(409);
    expect(trackServer).not.toHaveBeenCalled();
  });

  it('201 even when the service client is unavailable (analytics is best-effort)', async () => {
    const { ctx } = makeCtx('me');
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(null);

    expect((await POST(makeRequest(validBody))).status).toBe(201);
    expect(trackServer).not.toHaveBeenCalled();
  });
});
