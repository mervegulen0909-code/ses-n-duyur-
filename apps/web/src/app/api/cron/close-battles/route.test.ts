import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServiceClient: vi.fn(),
}));
vi.mock('@/lib/badges', () => ({
  grantBadge: vi.fn(async () => {}),
}));

import { grantBadge } from '@/lib/badges';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { GET } from './route';

type Service = ReturnType<typeof createSupabaseServiceClient>;

const PERF_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PERF_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const BATTLE = '11111111-1111-1111-1111-111111111111';

function makeRequest(secret?: string): Request {
  return new Request('http://localhost/api/cron/close-battles', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

function makeService(opts: {
  stale?: { id: string; perf_a: string; perf_b: string }[];
  votes?: { winner_performance_id: string }[];
  battleCounts?: { a: number; b: number };
}) {
  const rpc = vi.fn(async (_fn: string, _args?: Record<string, unknown>) => ({
    data: [{}],
    error: null,
  }));
  const battleUpdateEq = vi.fn(async () => ({ error: null }));
  const battleUpdate = vi.fn(() => ({ eq: battleUpdateEq }));

  const from = vi.fn((table: string) => {
    if (table === 'battles') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            lt: vi.fn(() => ({
              limit: vi.fn(async () => ({
                data: opts.stale ?? [{ id: BATTLE, perf_a: PERF_A, perf_b: PERF_B }],
                error: null,
              })),
            })),
          })),
        })),
        update: battleUpdate,
      };
    }
    if (table === 'battle_votes') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ eq: vi.fn(async () => ({ data: opts.votes ?? [] })) })),
        })),
      };
    }
    if (table === 'performances') {
      return {
        select: vi.fn(() => ({
          in: vi.fn(async () => ({
            data: [
              { id: PERF_A, user_id: 'owner-a', battle_count: opts.battleCounts?.a ?? 0 },
              { id: PERF_B, user_id: 'owner-b', battle_count: opts.battleCounts?.b ?? 0 },
            ],
          })),
        })),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });

  return { service: { from, rpc } as unknown as Service, rpc, battleUpdate };
}

describe('GET /api/cron/close-battles', () => {
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

  it('closes a zero-vote stale battle without touching Elo', async () => {
    const svc = makeService({ votes: [] });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    const res = await GET(makeRequest('cron-test-secret'));

    await expect(res.json()).resolves.toEqual({ closed: 1, applied: 0 });
    expect(svc.rpc).not.toHaveBeenCalled();
    expect(svc.battleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'closed', closed_at: expect.any(String) }),
    );
  });

  it('applies ONE margin-weighted update with provisional K=48 for new performances', async () => {
    const svc = makeService({
      votes: [
        { winner_performance_id: PERF_A },
        { winner_performance_id: PERF_A },
        { winner_performance_id: PERF_A },
        { winner_performance_id: PERF_B },
      ],
      battleCounts: { a: 2, b: 7 },
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    const res = await GET(makeRequest('cron-test-secret'));

    await expect(res.json()).resolves.toEqual({ closed: 1, applied: 1 });
    expect(svc.rpc).toHaveBeenCalledWith('apply_battle_result', {
      p_perf_a: PERF_A,
      p_perf_b: PERF_B,
      p_result_for_a: 0.75,
      p_k: 48,
    });
    // Elo applied exactly once; the only other rpc is the prediction settle.
    expect(
      svc.rpc.mock.calls.filter(([name]) => name === 'apply_battle_result'),
    ).toHaveLength(1);
    expect(grantBadge).toHaveBeenCalledWith(svc.service, 'owner-a', 'battle_champion');
  });

  it('settles predictions once per closed battle with the winner (A majority)', async () => {
    const svc = makeService({
      votes: [{ winner_performance_id: PERF_A }, { winner_performance_id: PERF_A }],
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    await GET(makeRequest('cron-test-secret'));

    expect(svc.rpc).toHaveBeenCalledWith('score_battle_predictions', {
      p_battle_id: BATTLE,
      p_winner: PERF_A,
    });
    expect(
      svc.rpc.mock.calls.filter(([name]) => name === 'score_battle_predictions'),
    ).toHaveLength(1);
  });

  it('settles predictions with perf B when B takes the majority', async () => {
    const svc = makeService({
      votes: [{ winner_performance_id: PERF_B }, { winner_performance_id: PERF_B }],
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    await GET(makeRequest('cron-test-secret'));

    expect(svc.rpc).toHaveBeenCalledWith('score_battle_predictions', {
      p_battle_id: BATTLE,
      p_winner: PERF_B,
    });
  });

  it('uses the settled K=24 once both sides are established, and skips the badge on a tie', async () => {
    const svc = makeService({
      votes: [{ winner_performance_id: PERF_A }, { winner_performance_id: PERF_B }],
      battleCounts: { a: 9, b: 12 },
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    await GET(makeRequest('cron-test-secret'));

    expect(svc.rpc).toHaveBeenCalledWith(
      'apply_battle_result',
      expect.objectContaining({ p_result_for_a: 0.5, p_k: 24 }),
    );
    expect(grantBadge).not.toHaveBeenCalled();
    // No winner → nothing to settle: predictions stay pending forever on a tie
    // rather than being scored against an arbitrary side.
    expect(svc.rpc).not.toHaveBeenCalledWith('score_battle_predictions', expect.anything());
  });
});
