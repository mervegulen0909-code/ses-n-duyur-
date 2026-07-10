import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  getRequestContext: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}));
vi.mock('@/lib/guard', () => ({
  rateLimit: vi.fn(async () => null),
  botGuard: vi.fn(async () => null),
}));

import { botGuard, rateLimit } from '@/lib/guard';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { POST } from './route';

const PERF = '11111111-1111-1111-1111-111111111111';
const LISTEN = '22222222-2222-2222-2222-222222222222';

type RequestCtx = Awaited<ReturnType<typeof getRequestContext>>;
type Service = ReturnType<typeof createSupabaseServiceClient>;

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/votes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = { performanceId: PERF, verifiedListenId: LISTEN, ratings: { vocalAccuracy: 80 } };

// RLS-scoped client: reads the verified listen + the performance's owner, then
// inserts the criteria rating.
function makeCtx(
  userId = 'me',
  opts: {
    listen?: Record<string, unknown> | null;
    insertError?: unknown;
    perfOwner?: string;
  } = {},
) {
  const listenMaybeSingle = vi.fn(async () => ({ data: opts.listen ?? null, error: null }));
  const perfMaybeSingle = vi.fn(async () => ({
    data: { user_id: opts.perfOwner ?? 'performance-owner' },
    error: null,
  }));
  const ratingsInsert = vi.fn(async () => ({ error: opts.insertError ?? null }));
  const from = vi.fn((table: string) => {
    if (table === 'verified_listens') {
      return { select: () => ({ eq: () => ({ maybeSingle: listenMaybeSingle }) }) };
    }
    if (table === 'performances') {
      return { select: () => ({ eq: () => ({ maybeSingle: perfMaybeSingle }) }) };
    }
    if (table === 'criteria_ratings') return { insert: ratingsInsert };
    return {};
  });
  return {
    ctx: { supabase: { from }, user: { id: userId } } as unknown as RequestCtx,
    ratingsInsert,
  };
}

// A valid listen owned by `userId` for PERF.
const validListen = { id: LISTEN, is_valid: true, user_id: 'me', performance_id: PERF };

function makeService(): Service {
  const scoresMaybeSingle = vi.fn(async () => ({ data: { initial_ai_score: 70 } }));
  const ratingsEq = vi.fn(async () => ({ data: [{ vocal_accuracy: 80 }] }));
  const scoresUpdateEq = vi.fn(async () => ({ error: null }));
  const from = vi.fn((table: string) => {
    if (table === 'scores') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: scoresMaybeSingle }) }),
        update: () => ({ eq: scoresUpdateEq }),
      };
    }
    if (table === 'criteria_ratings') return { select: () => ({ eq: ratingsEq }) };
    return {};
  });
  return { from } as unknown as Service;
}

describe('POST /api/votes — Verified-Listen gating (CLAUDE.md rule #4)', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('422 on invalid input', async () => {
    const res = await POST(
      makeRequest({ performanceId: PERF, verifiedListenId: LISTEN, ratings: {} }),
    );
    expect(res.status).toBe(422);
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

  it('403 when the bot-check fails', async () => {
    const { ctx } = makeCtx();
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(botGuard).mockResolvedValueOnce(Response.json({ error: 'bot' }, { status: 403 }));
    expect((await POST(makeRequest(validBody))).status).toBe(403);
  });

  it('403 when the listen is not valid (cannot vote without a completed Verified Listen)', async () => {
    const { ctx, ratingsInsert } = makeCtx('me', { listen: { ...validListen, is_valid: false } });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(403);
    expect(ratingsInsert).not.toHaveBeenCalled();
  });

  it('403 when the listen belongs to a DIFFERENT user (no voting on someone else’s listen)', async () => {
    const { ctx, ratingsInsert } = makeCtx('me', {
      listen: { ...validListen, user_id: 'someone-else' },
    });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    expect((await POST(makeRequest(validBody))).status).toBe(403);
    expect(ratingsInsert).not.toHaveBeenCalled();
  });

  it('403 when the listen is for a different performance', async () => {
    const { ctx } = makeCtx('me', {
      listen: { ...validListen, performance_id: '99999999-9999-9999-9999-999999999999' },
    });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    expect((await POST(makeRequest(validBody))).status).toBe(403);
  });

  it('403 when the voter OWNS the performance (no self-voting)', async () => {
    const { ctx, ratingsInsert } = makeCtx('me', { listen: validListen, perfOwner: 'me' });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      error: 'You cannot vote on your own performance',
    });
    expect(ratingsInsert).not.toHaveBeenCalled();
  });

  it('409 when the user already voted (unique violation)', async () => {
    const { ctx } = makeCtx('me', { listen: validListen, insertError: { message: 'duplicate' } });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeService());
    expect((await POST(makeRequest(validBody))).status).toBe(409);
  });

  it('201 on success, recording the vote with the SESSION voter id', async () => {
    const { ctx, ratingsInsert } = makeCtx('me-real', {
      listen: { ...validListen, user_id: 'me-real' },
    });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeService());

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({ ok: true });
    expect(ratingsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        performance_id: PERF,
        voter_id: 'me-real',
        verified_listen_id: LISTEN,
        vocal_accuracy: 80,
      }),
    );
  });
});
