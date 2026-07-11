import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServiceClient: vi.fn(),
}));

import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { AUTO_FLAG_REASON, GET } from './route';

type Service = ReturnType<typeof createSupabaseServiceClient>;

const PERF_1 = '11111111-1111-1111-1111-111111111111';
const PERF_2 = '22222222-2222-2222-2222-222222222222';

function makeRequest(secret?: string): Request {
  return new Request('http://localhost/api/cron/flag-vote-bursts', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

function vote(performanceId: string, voterId: string, listenId: string) {
  return { performance_id: performanceId, voter_id: voterId, verified_listen_id: listenId };
}

function makeService(opts: {
  votes?: { performance_id: string; voter_id: string; verified_listen_id: string }[];
  listens?: { id: string; ip_hash: string | null }[];
  openFlags?: { target_id: string }[];
}) {
  const inserted: Record<string, unknown>[] = [];
  const flagsInsert = vi.fn(async (rows: Record<string, unknown>[]) => {
    inserted.push(...rows);
    return { error: null };
  });

  const from = vi.fn((table: string) => {
    if (table === 'criteria_ratings') {
      return {
        select: vi.fn(() => ({
          gte: vi.fn(async () => ({ data: opts.votes ?? [], error: null })),
        })),
      };
    }
    if (table === 'verified_listens') {
      return {
        select: vi.fn(() => ({
          in: vi.fn(() => ({
            // `.not('ip_hash', 'is', null)` — the mock applies the same filter.
            not: vi.fn(async () => ({
              data: (opts.listens ?? []).filter((l) => l.ip_hash !== null),
              error: null,
            })),
          })),
        })),
      };
    }
    if (table === 'moderation_flags') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                in: vi.fn(async () => ({ data: opts.openFlags ?? [], error: null })),
              })),
            })),
          })),
        })),
        insert: flagsInsert,
      };
    }
    throw new Error(`unexpected table ${table}`);
  });

  return { service: { from } as unknown as Service, flagsInsert, inserted };
}

/** 5 votes on PERF_1; voters v1–v3 share network hash `shared`, v4–v5 differ. */
function burstFixture() {
  return {
    votes: [
      vote(PERF_1, 'v1', 'l1'),
      vote(PERF_1, 'v2', 'l2'),
      vote(PERF_1, 'v3', 'l3'),
      vote(PERF_1, 'v4', 'l4'),
      vote(PERF_1, 'v5', 'l5'),
    ],
    listens: [
      { id: 'l1', ip_hash: 'shared' },
      { id: 'l2', ip_hash: 'shared' },
      { id: 'l3', ip_hash: 'shared' },
      { id: 'l4', ip_hash: 'elsewhere' },
      { id: 'l5', ip_hash: null },
    ],
  };
}

describe('GET /api/cron/flag-vote-bursts', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-test-secret';
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

  it('auto-flags a performance where ≥3 distinct voters share one ip_hash', async () => {
    const svc = makeService(burstFixture());
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    const res = await GET(makeRequest('cron-test-secret'));

    await expect(res.json()).resolves.toEqual({ scanned: 1, flagged: 1 });
    expect(svc.inserted).toEqual([
      {
        target_type: 'performance',
        target_id: PERF_1,
        reporter_id: null,
        reason: AUTO_FLAG_REASON,
      },
    ]);
  });

  it('dedupes: an existing OPEN auto-flag suppresses a second insert', async () => {
    const svc = makeService({ ...burstFixture(), openFlags: [{ target_id: PERF_1 }] });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    const res = await GET(makeRequest('cron-test-secret'));

    await expect(res.json()).resolves.toEqual({ scanned: 1, flagged: 0 });
    expect(svc.flagsInsert).not.toHaveBeenCalled();
  });

  it('does not flag when the largest same-network cluster is below 3 voters', async () => {
    const fixture = burstFixture();
    // Break the cluster: v3 now votes from its own network.
    fixture.listens[2] = { id: 'l3', ip_hash: 'lonely' };
    const svc = makeService(fixture);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    const res = await GET(makeRequest('cron-test-secret'));

    await expect(res.json()).resolves.toEqual({ scanned: 1, flagged: 0 });
    expect(svc.flagsInsert).not.toHaveBeenCalled();
  });

  it('ignores performances with fewer than 5 votes in the window', async () => {
    const svc = makeService({
      votes: [
        vote(PERF_2, 'v1', 'l1'),
        vote(PERF_2, 'v2', 'l2'),
        vote(PERF_2, 'v3', 'l3'),
        vote(PERF_2, 'v4', 'l4'),
      ],
      listens: [
        { id: 'l1', ip_hash: 'shared' },
        { id: 'l2', ip_hash: 'shared' },
        { id: 'l3', ip_hash: 'shared' },
        { id: 'l4', ip_hash: 'shared' },
      ],
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    const res = await GET(makeRequest('cron-test-secret'));

    await expect(res.json()).resolves.toEqual({ scanned: 0, flagged: 0 });
    expect(svc.flagsInsert).not.toHaveBeenCalled();
  });
});
