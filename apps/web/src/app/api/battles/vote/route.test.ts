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
vi.mock('@/lib/league-points', () => ({
  addLeaguePoints: vi.fn(async () => {}),
}));

import { rateLimit } from '@/lib/guard';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { trackServer } from '@/lib/analytics-server';
import { addLeaguePoints } from '@/lib/league-points';
import { POST } from './route';

const BATTLE = '11111111-1111-1111-1111-111111111111';
const PERF_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PERF_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const LA = '22222222-2222-2222-2222-222222222222';
const LB = '33333333-3333-3333-3333-333333333333';

type RequestCtx = Awaited<ReturnType<typeof getRequestContext>>;
type Service = ReturnType<typeof createSupabaseServiceClient>;

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/battles/vote', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  battleId: BATTLE,
  winnerPerformanceId: PERF_A,
  listenAId: LA,
  listenBId: LB,
};

const battle = { id: BATTLE, perf_a: PERF_A, perf_b: PERF_B };
// Both listens valid, owned by `me`, covering the two sides.
const goodListens = [
  { id: LA, is_valid: true, user_id: 'me', performance_id: PERF_A },
  { id: LB, is_valid: true, user_id: 'me', performance_id: PERF_B },
];

function makeCtx(
  userId = 'me',
  opts: {
    battle?: Record<string, unknown> | null;
    listens?: unknown[];
    insertError?: unknown;
  } = {},
) {
  const battleMaybeSingle = vi.fn(async () => ({ data: 'battle' in opts ? opts.battle : battle }));
  const listensIn = vi.fn(async () => ({ data: opts.listens ?? goodListens }));
  const votesInsert = vi.fn(async () => ({ error: opts.insertError ?? null }));
  const from = vi.fn((table: string) => {
    if (table === 'battles')
      return { select: () => ({ eq: () => ({ maybeSingle: battleMaybeSingle }) }) };
    if (table === 'verified_listens') return { select: () => ({ in: listensIn }) };
    if (table === 'battle_votes') return { insert: votesInsert };
    return {};
  });
  return {
    ctx: { supabase: { from }, user: { id: userId } } as unknown as RequestCtx,
    votesInsert,
  };
}

function makeService(opts: { winnerOwnerId?: string } = {}) {
  // Elo is now applied atomically server-side via the apply_battle_result RPC.
  const rpc = vi.fn(async () => ({ data: [{ rating_a: 1516, rating_b: 1484 }], error: null }));
  // grantBadge('battle_champion') looks up the WINNING performance's owner
  // after a successful apply_battle_result.
  const perfMaybeSingle = vi.fn(async () => ({
    data: { user_id: opts.winnerOwnerId ?? 'winner-owner' },
  }));
  const from = vi.fn((table: string) => {
    if (table === 'performances') {
      return { select: () => ({ eq: () => ({ maybeSingle: perfMaybeSingle }) }) };
    }
    throw new Error(`unexpected table: ${table}`);
  });
  return { client: { rpc, from } as unknown as Service, rpc, from };
}

describe('POST /api/battles/vote — both-sides-listened gate (CLAUDE.md rule #5)', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('422 on invalid input', async () => {
    expect((await POST(makeRequest({ battleId: BATTLE }))).status).toBe(422);
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

  it('404 when the battle does not exist', async () => {
    const { ctx } = makeCtx('me', { battle: null });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    expect((await POST(makeRequest(validBody))).status).toBe(404);
  });

  it('422 when the winner is not one of the two performances', async () => {
    const { ctx } = makeCtx();
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    const res = await POST(
      makeRequest({ ...validBody, winnerPerformanceId: '99999999-9999-9999-9999-999999999999' }),
    );
    expect(res.status).toBe(422);
  });

  it('403 when one side is not validly listened', async () => {
    const { ctx, votesInsert } = makeCtx('me', {
      listens: [{ ...goodListens[0], is_valid: false }, goodListens[1]],
    });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    expect((await POST(makeRequest(validBody))).status).toBe(403);
    expect(votesInsert).not.toHaveBeenCalled();
  });

  it('403 when a listen belongs to a different user', async () => {
    const { ctx } = makeCtx('me', {
      listens: [goodListens[0], { ...goodListens[1], user_id: 'someone-else' }],
    });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    expect((await POST(makeRequest(validBody))).status).toBe(403);
  });

  it('403 when a listen does not cover its side of the battle', async () => {
    const { ctx } = makeCtx('me', {
      listens: [{ ...goodListens[0], performance_id: PERF_B }, goodListens[1]],
    });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    expect((await POST(makeRequest(validBody))).status).toBe(403);
  });

  it('409 when the user already voted in this battle', async () => {
    const { ctx } = makeCtx('me', { insertError: { message: 'duplicate' } });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeService().client);
    expect((await POST(makeRequest(validBody))).status).toBe(409);
  });

  it('201 on success, recording the vote with the SESSION voter id', async () => {
    const { ctx, votesInsert } = makeCtx('me');
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeService().client);

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(201);
    expect(votesInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        battle_id: BATTLE,
        voter_id: 'me',
        winner_performance_id: PERF_A,
        listen_a_id: LA,
        listen_b_id: LB,
        is_verified: true,
      }),
    );
    expect(trackServer).toHaveBeenCalledWith(expect.anything(), 'battle_completed', 'me', {
      battleId: BATTLE,
    });
    // Casting a verified vote accrues +2 weekly-league points.
    expect(addLeaguePoints).toHaveBeenCalledWith(expect.anything(), 'me', 2, {
      kind: 'battle_vote',
      id: `${BATTLE}:me`,
    });
  });

  it('409 when the battle is already closed (votes only while the window is open)', async () => {
    const { ctx, votesInsert } = makeCtx('me', { battle: { ...battle, status: 'closed' } });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(409);
    expect(votesInsert).not.toHaveBeenCalled();
  });

  it('does NOT apply Elo per vote — that moved to the close-battles cron', async () => {
    const { ctx } = makeCtx('me');
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    const service = makeService();
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.client);

    await POST(makeRequest(validBody));

    expect(service.rpc).not.toHaveBeenCalled();
  });
});
