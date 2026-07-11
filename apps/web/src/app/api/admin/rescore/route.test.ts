import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  getRequestContext: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  getProfileForContext: vi.fn(),
}));
vi.mock('@/lib/adapters/scoring', () => ({
  getScoringProvider: vi.fn(),
}));

import { getScoringProvider } from '@/lib/adapters/scoring';
import { getProfileForContext } from '@/lib/auth';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { POST } from './route';

type RequestCtx = Awaited<ReturnType<typeof getRequestContext>>;
type Profile = Awaited<ReturnType<typeof getProfileForContext>>;
type Service = ReturnType<typeof createSupabaseServiceClient>;
type Provider = ReturnType<typeof getScoringProvider>;

const PERF = '11111111-1111-1111-1111-111111111111';

function makeRequest(body?: unknown): Request {
  return new Request('http://localhost/api/admin/rescore', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function mockAdmin() {
  vi.mocked(getRequestContext).mockResolvedValue({
    supabase: {},
    user: { id: 'admin-1' },
  } as unknown as RequestCtx);
  vi.mocked(getProfileForContext).mockResolvedValue({
    id: 'admin-1',
    handle: 'boss',
    role: 'admin',
  } as unknown as Profile);
}

const REAL_RESULT = {
  initialAiScore: 88.5,
  breakdown: { vocalAccuracy: 90 },
  provisional: true,
  model: 'gpt-test-pinned',
  provider: 'openai' as const,
};

function makeService(
  opts: {
    mockRows?: { performance_id: string }[];
    totalMock?: number;
    perf?: Record<string, unknown> | null;
  } = {},
) {
  const scoresUpdateEq = vi.fn(async () => ({ error: null }));
  const scoresUpdate = vi.fn(() => ({ eq: scoresUpdateEq }));
  const rpc = vi.fn(async () => ({ data: [{}], error: null }));

  const queueOr = vi.fn(() => ({
    limit: vi.fn(async () => ({
      data: opts.mockRows ?? [{ performance_id: PERF }],
      error: null,
    })),
  }));

  const from = vi.fn((table: string) => {
    if (table === 'scores') {
      return {
        select: vi.fn((_cols: string, selOpts?: { head?: boolean }) => {
          if (selOpts?.head) {
            return { or: vi.fn(async () => ({ count: opts.totalMock ?? 1 })) };
          }
          return { or: queueOr };
        }),
        update: scoresUpdate,
      };
    }
    if (table === 'performances') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data:
                'perf' in opts
                  ? opts.perf
                  : {
                      id: PERF,
                      youtube_video_id: 'vid1',
                      oembed_meta: { title: 'Ave Maria', authorName: 'Warner Classics' },
                      has_video: true,
                    },
            })),
          })),
        })),
      };
    }
    if (table === 'measured_scores') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null })) })),
        })),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });

  return { service: { from, rpc } as unknown as Service, scoresUpdate, rpc, queueOr };
}

describe('POST /api/admin/rescore', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('403 when the caller is not an admin', async () => {
    vi.mocked(getRequestContext).mockResolvedValue({
      supabase: {},
      user: { id: 'u' },
    } as unknown as RequestCtx);
    vi.mocked(getProfileForContext).mockResolvedValue({
      id: 'u',
      handle: 'u',
      role: 'user',
    } as unknown as Profile);
    expect((await POST(makeRequest({}))).status).toBe(403);
  });

  it('422 on an out-of-range limit', async () => {
    expect((await POST(makeRequest({ limit: 99 }))).status).toBe(422);
  });

  it('503 and NO writes when the real provider degrades to mock (honesty rule)', async () => {
    mockAdmin();
    const svc = makeService({});
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);
    vi.mocked(getScoringProvider).mockReturnValue({
      score: vi.fn(async () => ({ ...REAL_RESULT, provider: 'mock' as const })),
    } as unknown as Provider);

    const res = await POST(makeRequest({}));

    expect(res.status).toBe(503);
    expect(svc.scoresUpdate).not.toHaveBeenCalled();
    expect(svc.rpc).not.toHaveBeenCalled();
  });

  it('re-scores a mock row: updates provenance and recomputes via the RPC', async () => {
    mockAdmin();
    const svc = makeService({ totalMock: 1 });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);
    vi.mocked(getScoringProvider).mockReturnValue({
      score: vi.fn(async () => REAL_RESULT),
    } as unknown as Provider);

    const res = await POST(makeRequest({}));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      rescored: 1,
      failed: 0,
      remaining: 0,
      provider: 'openai',
      model: 'gpt-test-pinned',
    });
    expect(svc.scoresUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        initial_ai_score: 88.5,
        ai_provider: 'openai',
        ai_model: 'gpt-test-pinned',
        is_provisional: true,
      }),
    );
    expect(svc.rpc).toHaveBeenCalledWith('recompute_performance_score', {
      p_performance_id: PERF,
      p_initial_ai_score: 88.5,
      p_trend_baseline: 88.5,
    });
  });

  it('returns all-zero when no mock rows remain', async () => {
    mockAdmin();
    const svc = makeService({ mockRows: [], totalMock: 0 });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    const res = await POST(makeRequest({}));

    await expect(res.json()).resolves.toEqual({ rescored: 0, failed: 0, remaining: 0 });
  });

  it('counts a vanished performance as failed and keeps going', async () => {
    mockAdmin();
    const svc = makeService({ perf: null, totalMock: 1 });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);
    vi.mocked(getScoringProvider).mockReturnValue({
      score: vi.fn(async () => REAL_RESULT),
    } as unknown as Provider);

    const res = await POST(makeRequest({}));

    await expect(res.json()).resolves.toMatchObject({ rescored: 0, failed: 1 });
    expect(svc.scoresUpdate).not.toHaveBeenCalled();
  });

  it('queues rows below the current scoring version, not only mock ones', async () => {
    mockAdmin();
    const svc = makeService({ totalMock: 1 });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);
    vi.mocked(getScoringProvider).mockReturnValue({
      score: vi.fn(async () => REAL_RESULT),
    } as unknown as Provider);

    await POST(makeRequest({}));

    const { SCORING_VERSION } = await import('@voxscore/core');
    expect(svc.queueOr).toHaveBeenCalledWith(
      `ai_provider.eq.mock,scoring_version.lt.${SCORING_VERSION}`,
    );
  });

  it('accepts an empty body (defaults limit)', async () => {
    mockAdmin();
    const svc = makeService({ totalMock: 1 });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);
    vi.mocked(getScoringProvider).mockReturnValue({
      score: vi.fn(async () => REAL_RESULT),
    } as unknown as Provider);

    expect((await POST(makeRequest())).status).toBe(200);
  });
});
