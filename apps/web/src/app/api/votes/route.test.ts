import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  getRequestContext: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}));
vi.mock('@/lib/guard', () => ({
  rateLimit: vi.fn(async () => null),
  botGuard: vi.fn(async () => null),
}));
vi.mock('@/lib/analytics-server', () => ({ trackServer: vi.fn(async () => {}) }));

import { botGuard, rateLimit } from '@/lib/guard';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { trackServer } from '@/lib/analytics-server';
import { CRITERIA } from '@voxscore/scoring';
import { POST } from './route';

const PERF = '11111111-1111-1111-1111-111111111111';
const LISTEN = '22222222-2222-2222-2222-222222222222';
type RequestCtx = Awaited<ReturnType<typeof getRequestContext>>;
type Service = ReturnType<typeof createSupabaseServiceClient>;

const validRatings = Object.fromEntries(CRITERIA.map((criterion) => [criterion, 80]));
const validBody = { performanceId: PERF, verifiedListenId: LISTEN, ratings: validRatings };
const validListen = { id: LISTEN, is_valid: true, user_id: 'me', performance_id: PERF };

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/votes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeCtx(
  userId = 'me',
  opts: {
    listen?: Record<string, unknown> | null;
    perfOwner?: string;
    hasVideo?: boolean;
    recentVotes?: number;
  } = {},
) {
  const listenMaybeSingle = vi.fn(async () => ({ data: opts.listen ?? null, error: null }));
  const perfMaybeSingle = vi.fn(async () => ({
    data: { user_id: opts.perfOwner ?? 'performance-owner', has_video: opts.hasVideo ?? true },
    error: null,
  }));
  const ratingsCountGt = vi.fn(async () => ({ count: opts.recentVotes ?? 0 }));
  const from = vi.fn((table: string) => {
    if (table === 'verified_listens') {
      return { select: () => ({ eq: () => ({ maybeSingle: listenMaybeSingle }) }) };
    }
    if (table === 'performances') {
      return { select: () => ({ eq: () => ({ maybeSingle: perfMaybeSingle }) }) };
    }
    if (table === 'criteria_ratings') {
      return { select: () => ({ eq: () => ({ gt: ratingsCountGt }) }) };
    }
    throw new Error(`unexpected table ${table}`);
  });
  return { ctx: { supabase: { from }, user: { id: userId } } as unknown as RequestCtx };
}

function makeService(
  opts: {
    measured?: Record<string, number> | null;
    scoreRow?: unknown;
    verifiedVoteCount?: number;
    rpcError?: { code?: string; message?: string } | null;
  } = {},
) {
  const notificationInsert = vi.fn(async () => ({ error: null }));
  const rpc = vi.fn(async (name: string) => {
    if (name === 'submit_vote_and_recompute') {
      return {
        data: opts.rpcError
          ? null
          : [
              {
                listener_score: 80,
                current_score: 71.5,
                trend_score: 1.5,
                verified_vote_count: opts.verifiedVoteCount ?? 1,
              },
            ],
        error: opts.rpcError ?? null,
      };
    }
    return { data: null, error: null };
  });
  const from = vi.fn((table: string) => {
    if (table === 'scores') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: opts.scoreRow ?? { initial_ai_score: 70, score_status: 'ai_verified' },
            }),
          }),
        }),
      };
    }
    if (table === 'measured_scores') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: opts.measured ? { measured_breakdown: opts.measured } : null,
            }),
          }),
        }),
      };
    }
    if (table === 'notification_events') return { insert: notificationInsert };
    throw new Error(`unexpected service table ${table}`);
  });
  return { client: { from, rpc } as unknown as Service, rpc, notificationInsert };
}

describe('POST /api/votes — atomic Verified Listen voting', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('400 on malformed JSON and 422 on invalid input', async () => {
    const malformed = new Request('http://localhost/api/votes', { method: 'POST', body: '{' });
    expect((await POST(malformed)).status).toBe(400);
    expect((await POST(makeRequest({ ...validBody, ratings: {} }))).status).toBe(422);
  });

  it('401 when unauthenticated', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(null);
    expect((await POST(makeRequest(validBody))).status).toBe(401);
  });

  it('honors rate-limit and bot gates before reads', async () => {
    const { ctx } = makeCtx();
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(rateLimit).mockResolvedValueOnce(Response.json({}, { status: 429 }));
    expect((await POST(makeRequest(validBody))).status).toBe(429);

    vi.mocked(rateLimit).mockResolvedValueOnce(null);
    vi.mocked(botGuard).mockResolvedValueOnce(Response.json({}, { status: 403 }));
    expect((await POST(makeRequest(validBody))).status).toBe(403);
  });

  it.each([
    [{ ...validListen, is_valid: false }],
    [{ ...validListen, user_id: 'someone-else' }],
    [{ ...validListen, performance_id: '99999999-9999-9999-9999-999999999999' }],
  ])('403 for an invalid, foreign, or mismatched listen', async (listen) => {
    const { ctx } = makeCtx('me', { listen });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    expect((await POST(makeRequest(validBody))).status).toBe(403);
  });

  it('403 for a self-vote and 422 for incomplete applicable criteria', async () => {
    const own = makeCtx('me', { listen: validListen, perfOwner: 'me' });
    vi.mocked(getRequestContext).mockResolvedValue(own.ctx);
    expect((await POST(makeRequest(validBody))).status).toBe(403);

    const other = makeCtx('me', { listen: validListen });
    vi.mocked(getRequestContext).mockResolvedValue(other.ctx);
    expect((await POST(makeRequest({ ...validBody, ratings: { vocalAccuracy: 80 } }))).status).toBe(
      422,
    );
  });

  it('429 after 50 votes in 24h, before the transaction', async () => {
    const { ctx } = makeCtx('me', { listen: validListen, recentVotes: 50 });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    expect((await POST(makeRequest(validBody))).status).toBe(429);
  });

  it('503 before mutation when the service client is unavailable', async () => {
    const { ctx } = makeCtx('me', { listen: validListen });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(null);
    expect((await POST(makeRequest(validBody))).status).toBe(503);
  });

  it('atomically submits the vote and recomputes the score', async () => {
    const { ctx } = makeCtx('me-real', {
      listen: { ...validListen, user_id: 'me-real' },
    });
    const service = makeService();
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.client);

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({ ok: true, verifiedVoteCount: 1 });
    expect(service.rpc).toHaveBeenCalledWith(
      'submit_vote_and_recompute',
      expect.objectContaining({
        p_voter_id: 'me-real',
        p_performance_id: PERF,
        p_verified_listen_id: LISTEN,
        p_vocal_accuracy: 80,
        p_stage_presence: 80,
        p_initial_ai_score: 70,
      }),
    );
    expect(service.notificationInsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'performance-owner', kind: 'new_vote' }),
    );
    expect(trackServer).toHaveBeenCalled();
  });

  it('maps transactional duplicate and daily-limit races to retry-safe statuses', async () => {
    const { ctx } = makeCtx('me', { listen: validListen });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);

    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeService({ rpcError: { code: '23505', message: 'duplicate' } }).client,
    );
    expect((await POST(makeRequest(validBody))).status).toBe(409);

    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeService({ rpcError: { message: 'daily_vote_limit' } }).client,
    );
    expect((await POST(makeRequest(validBody))).status).toBe(429);
  });

  it.each([
    ['verified_listen_required', 403],
    ['self_vote_forbidden', 403],
    ['performance_not_found', 404],
    ['criteria_incomplete', 422],
    ['unexpected', 500],
  ])('maps DB invariant %s to %i', async (message, status) => {
    const { ctx } = makeCtx('me', { listen: validListen });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeService({ rpcError: { message } }).client,
    );
    expect((await POST(makeRequest(validBody))).status).toBe(status);
  });

  it('grants the centurion badge at 100 votes and keeps side effects best-effort', async () => {
    const { ctx } = makeCtx('me', { listen: validListen, perfOwner: 'owner-1' });
    const service = makeService({ verifiedVoteCount: 100 });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.client);
    vi.mocked(trackServer).mockRejectedValueOnce(new Error('analytics down'));

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(201);
    expect(service.rpc).toHaveBeenCalledWith('grant_badge', {
      p_user_id: 'owner-1',
      p_badge_key: 'centurion',
    });
  });

  it('uses the immutable verified AI opening score as the vote blend basis', async () => {
    const { ctx } = makeCtx('me', { listen: validListen });
    const service = makeService({
      scoreRow: { initial_ai_score: 70, score_status: 'ai_verified' },
      measured: {
        vocalAccuracy: 100,
        rhythmTiming: 100,
        technicalSkill: 100,
        recordingQuality: 100,
      },
    });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.client);

    await POST(makeRequest(validBody));

    expect(service.rpc).toHaveBeenCalledWith(
      'submit_vote_and_recompute',
      expect.objectContaining({ p_initial_ai_score: 70, p_trend_baseline: 70 }),
    );
  });

  it('blocks community voting until AI Judge has created the first score', async () => {
    const { ctx } = makeCtx('me', { listen: validListen });
    const service = makeService({
      scoreRow: { initial_ai_score: 70, score_status: 'legacy_metadata' },
    });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.client);

    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(409);
    expect(service.rpc).not.toHaveBeenCalledWith('submit_vote_and_recompute', expect.anything());
  });
});
