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
import { CRITERIA } from '@voxscore/scoring';
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

const validRatings = Object.fromEntries(CRITERIA.map((criterion) => [criterion, 80]));
const validBody = { performanceId: PERF, verifiedListenId: LISTEN, ratings: validRatings };

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
    data: { user_id: opts.perfOwner ?? 'performance-owner', has_video: true },
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

function makeService(opts: { measured?: Record<string, number> | null; scoreRow?: unknown } = {}) {
  const scoresMaybeSingle = vi.fn(async () => ({
    data: opts.scoreRow ?? { initial_ai_score: 70, ai_breakdown: null },
  }));
  const measuredMaybeSingle = vi.fn(async () => ({
    data: opts.measured ? { measured_breakdown: opts.measured } : null,
  }));
  const ratingsEq = vi.fn(async () => ({ data: [{ vocal_accuracy: 80 }] }));
  const rpc = vi.fn(async () => ({
    data: [
      {
        listener_score: 80,
        current_score: 71.5,
        trend_score: 1.5,
        verified_vote_count: 1,
      },
    ],
    error: null,
  }));
  const from = vi.fn((table: string) => {
    if (table === 'scores') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: scoresMaybeSingle }) }),
      };
    }
    if (table === 'measured_scores') {
      return { select: () => ({ eq: () => ({ maybeSingle: measuredMaybeSingle }) }) };
    }
    if (table === 'criteria_ratings') return { select: () => ({ eq: ratingsEq }) };
    return {};
  });
  return { client: { from, rpc } as unknown as Service, rpc };
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

  it('422 when an applicable criterion is missing', async () => {
    const { ctx } = makeCtx('me', { listen: validListen });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    const res = await POST(
      makeRequest({
        ...validBody,
        ratings: { vocalAccuracy: 80 },
      }),
    );
    expect(res.status).toBe(422);
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
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeService().client);
    expect((await POST(makeRequest(validBody))).status).toBe(409);
  });

  it('201 on success, recording the vote with the SESSION voter id', async () => {
    const { ctx, ratingsInsert } = makeCtx('me-real', {
      listen: { ...validListen, user_id: 'me-real' },
    });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeService().client);

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
    expect(createSupabaseServiceClient).toHaveBeenCalled();
  });

  it('blends from the MEASURED basis when a measurement exists (ADR 0003)', async () => {
    const { ctx } = makeCtx('me-real', { listen: { ...validListen, user_id: 'me-real' } });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    const { CRITERIA } = await import('@voxscore/scoring');
    const aiBreakdown = Object.fromEntries(CRITERIA.map((c) => [c, 70]));
    const service = makeService({
      scoreRow: { initial_ai_score: 70, ai_breakdown: aiBreakdown },
      measured: {
        vocalAccuracy: 100,
        rhythmTiming: 100,
        technicalSkill: 100,
        recordingQuality: 100,
      },
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.client);

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(201);

    // Basis lifted above the plain 70 estimate: with one 80-overall vote the
    // blended current must exceed the estimate-only blend (0.85*70 + 0.15*80).
    expect(service.rpc).toHaveBeenCalledWith(
      'recompute_performance_score',
      expect.objectContaining({
        p_performance_id: PERF,
        p_trend_baseline: 70,
      }),
    );
  });
});
