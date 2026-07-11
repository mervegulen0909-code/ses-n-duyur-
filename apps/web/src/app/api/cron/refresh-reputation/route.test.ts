import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServiceClient: vi.fn(),
}));

import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { CRITERIA } from '@voxscore/scoring';
import { COLUMN } from '@/app/api/votes/overall';
import { GET } from './route';

type Service = ReturnType<typeof createSupabaseServiceClient>;

const PERF_1 = '11111111-1111-1111-1111-111111111111';
const PERF_2 = '22222222-2222-2222-2222-222222222222';
const PERF_3 = '33333333-3333-3333-3333-333333333333';

function makeRequest(secret?: string): Request {
  return new Request('http://localhost/api/cron/refresh-reputation', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

/** A criteria_ratings row where every criterion equals `value` → overall = value. */
function ratingRow(voterId: string, performanceId: string, value: number) {
  return {
    voter_id: voterId,
    performance_id: performanceId,
    ...Object.fromEntries(CRITERIA.map((c) => [COLUMN[c], value])),
  };
}

function makeService(opts: {
  consensus?: { performance_id: string; listener_score: number }[];
  ratings?: Record<string, unknown>[];
  fittedAt?: { id: string; reputation_fitted_at: string | null }[];
}) {
  const updates: { id: string; reputation: number }[] = [];
  const fittedStamps: { id: string; fittedAt: string | undefined }[] = [];
  const profilesUpdate = vi.fn(
    (payload: { reputation: number; reputation_fitted_at?: string }) => ({
      eq: vi.fn(async (_col: string, id: string) => {
        updates.push({ id, reputation: payload.reputation });
        fittedStamps.push({ id, fittedAt: payload.reputation_fitted_at });
        return { error: null };
      }),
    }),
  );

  const from = vi.fn((table: string) => {
    if (table === 'scores') {
      return {
        select: vi.fn(() => ({
          gte: vi.fn(() => ({
            not: vi.fn(async () => ({ data: opts.consensus ?? [], error: null })),
          })),
        })),
      };
    }
    if (table === 'criteria_ratings') {
      return {
        select: vi.fn(() => ({
          in: vi.fn(async () => ({ data: opts.ratings ?? [], error: null })),
        })),
      };
    }
    if (table === 'profiles') {
      return {
        update: profilesUpdate,
        select: vi.fn(() => ({
          in: vi.fn(async () => ({ data: opts.fittedAt ?? [], error: null })),
        })),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });

  return { service: { from } as unknown as Service, profilesUpdate, updates, fittedStamps };
}

describe('GET /api/cron/refresh-reputation', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-test-secret';
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    delete process.env.CRON_SECRET;
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('403 without the cron bearer secret', async () => {
    expect((await GET(makeRequest())).status).toBe(403);
    expect((await GET(makeRequest('wrong'))).status).toBe(403);
  });

  it('no-ops when no performance has a consensus listener score yet', async () => {
    const svc = makeService({ consensus: [] });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    const res = await GET(makeRequest('cron-test-secret'));

    await expect(res.json()).resolves.toEqual({ voters: 0, updated: 0 });
    expect(svc.profilesUpdate).not.toHaveBeenCalled();
  });

  it('refits voters with ≥3 consensus comparisons and skips sparser voters', async () => {
    const consensus = [
      { performance_id: PERF_1, listener_score: 80 },
      { performance_id: PERF_2, listener_score: 60 },
      { performance_id: PERF_3, listener_score: 70 },
    ];
    const svc = makeService({
      consensus,
      ratings: [
        // Tracks consensus exactly (mad 0 → weight 1.5 → reputation 1500).
        ratingRow('v-agree', PERF_1, 80),
        ratingRow('v-agree', PERF_2, 60),
        ratingRow('v-agree', PERF_3, 70),
        // 60 points off every time (mad 60 → clamped weight 0.5 → 500).
        ratingRow('v-outlier', PERF_1, 20),
        ratingRow('v-outlier', PERF_2, 0),
        ratingRow('v-outlier', PERF_3, 10),
        // Only two comparisons → never refit (below MIN_COMPARISONS).
        ratingRow('v-sparse', PERF_1, 80),
        ratingRow('v-sparse', PERF_2, 60),
      ],
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    const res = await GET(makeRequest('cron-test-secret'));

    await expect(res.json()).resolves.toEqual({ voters: 2, updated: 2 });
    expect(svc.updates).toEqual(
      expect.arrayContaining([
        { id: 'v-agree', reputation: 1500 },
        { id: 'v-outlier', reputation: 500 },
      ]),
    );
    expect(svc.updates).toHaveLength(2);
  });

  it('round-robin: refits the never-fitted / oldest voters first and stamps reputation_fitted_at', async () => {
    const consensus = [
      { performance_id: PERF_1, listener_score: 80 },
      { performance_id: PERF_2, listener_score: 60 },
      { performance_id: PERF_3, listener_score: 70 },
    ];
    const svc = makeService({
      consensus,
      ratings: [
        ratingRow('v-old', PERF_1, 80),
        ratingRow('v-old', PERF_2, 60),
        ratingRow('v-old', PERF_3, 70),
        ratingRow('v-new', PERF_1, 80),
        ratingRow('v-new', PERF_2, 60),
        ratingRow('v-new', PERF_3, 70),
      ],
      fittedAt: [
        { id: 'v-new', reputation_fitted_at: '2026-07-12T00:00:00.000Z' }, // fitted recently
        { id: 'v-old', reputation_fitted_at: null }, // never fitted → drains first
      ],
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    await GET(makeRequest('cron-test-secret'));

    // Never-fitted voter is refit before the recently-fitted one.
    expect(svc.updates.map((u) => u.id)).toEqual(['v-old', 'v-new']);
    // Every refit stamps the round-robin cursor.
    expect(svc.fittedStamps.every((s) => typeof s.fittedAt === 'string')).toBe(true);
  });

  it('a moderate deviation lands between the clamps (mad 12.5 → neutral 1000)', async () => {
    const svc = makeService({
      consensus: [
        { performance_id: PERF_1, listener_score: 80 },
        { performance_id: PERF_2, listener_score: 60 },
        { performance_id: PERF_3, listener_score: 70 },
      ],
      ratings: [
        ratingRow('v-mid', PERF_1, 92.5),
        ratingRow('v-mid', PERF_2, 47.5),
        ratingRow('v-mid', PERF_3, 82.5),
      ],
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    await GET(makeRequest('cron-test-secret'));

    expect(svc.updates).toEqual([{ id: 'v-mid', reputation: 1000 }]);
  });
});
