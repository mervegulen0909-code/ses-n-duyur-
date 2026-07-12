import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  getRequestContext: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}));
vi.mock('@/lib/guard', () => ({
  rateLimit: vi.fn(async () => null),
  botGuard: vi.fn(async () => null),
}));
vi.mock('@/lib/analytics-server', () => ({
  trackServer: vi.fn(async () => {}),
}));

import { botGuard, rateLimit } from '@/lib/guard';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { trackServer } from '@/lib/analytics-server';
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
    recentVotes?: number;
    reputation?: number;
  } = {},
) {
  const listenMaybeSingle = vi.fn(async () => ({ data: opts.listen ?? null, error: null }));
  const perfMaybeSingle = vi.fn(async () => ({
    data: { user_id: opts.perfOwner ?? 'performance-owner', has_video: true },
    error: null,
  }));
  const profileMaybeSingle = vi.fn(async () => ({
    data: { reputation: opts.reputation ?? 0 },
    error: null,
  }));
  const ratingsInsert = vi.fn(async () => ({ error: opts.insertError ?? null }));
  // Velocity cap probe: select('id', {head}).eq('voter_id').gt('created_at')
  const ratingsCountGt = vi.fn(async () => ({ count: opts.recentVotes ?? 0 }));
  const from = vi.fn((table: string) => {
    if (table === 'verified_listens') {
      return { select: () => ({ eq: () => ({ maybeSingle: listenMaybeSingle }) }) };
    }
    if (table === 'performances') {
      return { select: () => ({ eq: () => ({ maybeSingle: perfMaybeSingle }) }) };
    }
    if (table === 'profiles') {
      return { select: () => ({ eq: () => ({ maybeSingle: profileMaybeSingle }) }) };
    }
    if (table === 'criteria_ratings') {
      return {
        insert: ratingsInsert,
        select: vi.fn(() => ({ eq: vi.fn(() => ({ gt: ratingsCountGt })) })),
      };
    }
    return {};
  });
  return {
    ctx: { supabase: { from }, user: { id: userId } } as unknown as RequestCtx,
    ratingsInsert,
  };
}

// A valid listen owned by `userId` for PERF.
const validListen = { id: LISTEN, is_valid: true, user_id: 'me', performance_id: PERF };

function makeService(
  opts: {
    measured?: Record<string, number> | null;
    scoreRow?: unknown;
    verifiedVoteCount?: number;
  } = {},
) {
  const scoresMaybeSingle = vi.fn(async () => ({
    data: opts.scoreRow ?? { initial_ai_score: 70, ai_breakdown: null },
  }));
  const measuredMaybeSingle = vi.fn(async () => ({
    data: opts.measured ? { measured_breakdown: opts.measured } : null,
  }));
  const ratingsEq = vi.fn(async () => ({ data: [{ vocal_accuracy: 80 }] }));
  const notificationInsert = vi.fn(async () => ({ error: null }));
  const rpc = vi.fn(async () => ({
    data: [
      {
        listener_score: 80,
        current_score: 71.5,
        trend_score: 1.5,
        verified_vote_count: opts.verifiedVoteCount ?? 1,
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
    if (table === 'notification_events') return { insert: notificationInsert };
    return {};
  });
  return { client: { from, rpc } as unknown as Service, rpc, notificationInsert };
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

  it('429 after 50 votes in 24h (velocity cap), before any insert', async () => {
    const { ctx, ratingsInsert } = makeCtx('me', { listen: validListen, recentVotes: 50 });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(429);
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
    const service = makeService();
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.client);

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({ ok: true });
    expect(service.notificationInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'performance-owner',
        kind: 'new_vote',
      }),
    );
    expect(ratingsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        performance_id: PERF,
        voter_id: 'me-real',
        verified_listen_id: LISTEN,
        vocal_accuracy: 80,
        weight: 1,
      }),
    );
    expect(createSupabaseServiceClient).toHaveBeenCalled();
    expect(trackServer).toHaveBeenCalledWith(expect.anything(), 'vote_submitted', 'me-real', {
      performanceId: PERF,
    });
  });

  it('stamps the voter’s reputation-derived trust weight on the rating insert (T9)', async () => {
    const { ctx, ratingsInsert } = makeCtx('me', { listen: validListen, reputation: 1500 });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeService().client);

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(201);
    expect(ratingsInsert).toHaveBeenCalledWith(expect.objectContaining({ weight: 1.5 }));
  });

  it('503 (fails closed) when the service role is unavailable — the vote is not silently accepted', async () => {
    const { ctx } = makeCtx('me-real', { listen: { ...validListen, user_id: 'me-real' } });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(null);

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(503);
  });

  it('still returns 201 when a post-recompute side effect fails (best-effort, vote already counted)', async () => {
    const { ctx } = makeCtx('me-real', { listen: { ...validListen, user_id: 'me-real' } });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeService().client);
    vi.mocked(trackServer).mockRejectedValueOnce(new Error('analytics down'));

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(201);
  });

  it('does NOT grant the centurion badge below the 100-vote threshold', async () => {
    const { ctx } = makeCtx('me-real', { listen: { ...validListen, user_id: 'me-real' } });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    const service = makeService({ verifiedVoteCount: 99 });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.client);

    await POST(makeRequest(validBody));

    expect(service.rpc).not.toHaveBeenCalledWith('grant_badge', expect.anything());
  });

  it('grants the centurion badge to the PERFORMANCE OWNER at 100 verified votes', async () => {
    const { ctx } = makeCtx('me-real', {
      listen: { ...validListen, user_id: 'me-real' },
      perfOwner: 'owner-1',
    });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    const service = makeService({ verifiedVoteCount: 100 });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.client);

    await POST(makeRequest(validBody));

    expect(service.rpc).toHaveBeenCalledWith('grant_badge', {
      p_user_id: 'owner-1',
      p_badge_key: 'centurion',
    });
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
