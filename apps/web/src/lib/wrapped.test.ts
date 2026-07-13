import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildWrappedData, type WrappedData } from './wrapped';

const ZERO: WrappedData = {
  battlesWon: 0,
  battlesLost: 0,
  votesCast: 0,
  validListens: 0,
  predictionPoints: 0,
};

interface QueryResult {
  data?: unknown;
  count?: number | null;
}

/** One awaited supabase query: every filter chains back to the same object. */
function chain(result: QueryResult) {
  const q = {
    select: vi.fn(),
    eq: vi.fn(),
    or: vi.fn(),
    in: vi.fn(),
    gte: vi.fn(),
    lte: vi.fn(),
    maybeSingle: vi.fn(async () => result),
    then: <T>(onFulfilled: (value: QueryResult) => T) => Promise.resolve(result).then(onFulfilled),
  };
  q.select.mockReturnValue(q);
  q.eq.mockReturnValue(q);
  q.or.mockReturnValue(q);
  q.in.mockReturnValue(q);
  q.gte.mockReturnValue(q);
  q.lte.mockReturnValue(q);
  return q;
}

type Chain = ReturnType<typeof chain>;

/** Fake service: per-table FIFO of canned results (queries run sequentially). */
function makeService(resultsByTable: Record<string, QueryResult[]>) {
  const queries: Record<string, Chain[]> = {};
  const from = vi.fn((table: string) => {
    const result = (resultsByTable[table] ?? []).shift() ?? { data: null, count: null };
    const q = chain(result);
    (queries[table] ??= []).push(q);
    return q;
  });
  return { service: { from } as never, from, queries };
}

/** The i-th query issued against `table`, or throw (keeps assertions strict). */
function issued(svc: ReturnType<typeof makeService>, table: string, i = 0): Chain {
  const query = svc.queries[table]?.[i];
  if (!query) throw new Error(`no query #${i} against ${table}`);
  return query;
}

const SEASON = { starts_at: '2026-07-01T00:00:00.000Z', ends_at: null };

afterEach(() => vi.clearAllMocks());

describe('buildWrappedData', () => {
  it('returns zeros without querying when no season is open (null seasonId)', async () => {
    const svc = makeService({});
    await expect(buildWrappedData(svc.service, 'u1', null)).resolves.toEqual(ZERO);
    expect(svc.from).not.toHaveBeenCalled();
  });

  it('returns zeros when the season row is missing', async () => {
    const svc = makeService({ seasons: [{ data: null }] });
    await expect(buildWrappedData(svc.service, 'u1', 's1')).resolves.toEqual(ZERO);
    expect(svc.from).toHaveBeenCalledTimes(1);
    expect(svc.from).toHaveBeenCalledWith('seasons');
  });

  it('assembles the five stats, deciding battles by verified-vote majority (cron rule)', async () => {
    const svc = makeService({
      seasons: [{ data: SEASON }],
      performances: [{ data: [{ id: 'p1' }, { id: 'p2' }] }],
      battles: [
        {
          data: [
            { id: 'b-win', perf_a: 'p1', perf_b: 'x1' },
            { id: 'b-loss', perf_a: 'x2', perf_b: 'p2' },
            { id: 'b-tie', perf_a: 'p1', perf_b: 'x3' },
            { id: 'b-novotes', perf_a: 'p2', perf_b: 'x4' },
          ],
        },
      ],
      battle_votes: [
        {
          data: [
            // b-win: 2-1 for my p1.
            { battle_id: 'b-win', winner_performance_id: 'p1' },
            { battle_id: 'b-win', winner_performance_id: 'p1' },
            { battle_id: 'b-win', winner_performance_id: 'x1' },
            // b-loss: 2-1 against my p2.
            { battle_id: 'b-loss', winner_performance_id: 'x2' },
            { battle_id: 'b-loss', winner_performance_id: 'x2' },
            { battle_id: 'b-loss', winner_performance_id: 'p2' },
            // b-tie: 1-1 — the close cron declares no winner on 0.5.
            { battle_id: 'b-tie', winner_performance_id: 'p1' },
            { battle_id: 'b-tie', winner_performance_id: 'x3' },
            // Stray vote for a battle outside the fetched set — ignored.
            { battle_id: 'b-elsewhere', winner_performance_id: 'p1' },
          ],
        },
        { count: 7 }, // votesCast
      ],
      verified_listens: [{ count: 12 }],
      profiles: [{ data: { prediction_points: 30 } }],
    });

    await expect(buildWrappedData(svc.service, 'u1', 's1')).resolves.toEqual({
      battlesWon: 1,
      battlesLost: 1,
      votesCast: 7,
      validListens: 12,
      predictionPoints: 30,
    });

    // Battles: only CLOSED battles of THIS season where I own a side.
    const battlesQ = issued(svc, 'battles');
    expect(battlesQ.eq).toHaveBeenCalledWith('status', 'closed');
    expect(battlesQ.eq).toHaveBeenCalledWith('season_id', 's1');
    expect(battlesQ.or).toHaveBeenCalledWith('perf_a.in.(p1,p2),perf_b.in.(p1,p2)');

    // Winner recount uses only VERIFIED votes for the fetched battles.
    const winnerVotesQ = issued(svc, 'battle_votes', 0);
    expect(winnerVotesQ.in).toHaveBeenCalledWith('battle_id', [
      'b-win',
      'b-loss',
      'b-tie',
      'b-novotes',
    ]);
    expect(winnerVotesQ.eq).toHaveBeenCalledWith('is_verified', true);

    // votesCast: my verified votes, lower-bounded by the season start; the
    // season is still open (ends_at null) so no upper bound is applied.
    const votesCastQ = issued(svc, 'battle_votes', 1);
    expect(votesCastQ.eq).toHaveBeenCalledWith('voter_id', 'u1');
    expect(votesCastQ.eq).toHaveBeenCalledWith('is_verified', true);
    expect(votesCastQ.gte).toHaveBeenCalledWith('created_at', SEASON.starts_at);
    expect(votesCastQ.lte).not.toHaveBeenCalled();

    // validListens: my valid listens within the same bounds.
    const listensQ = issued(svc, 'verified_listens');
    expect(listensQ.eq).toHaveBeenCalledWith('user_id', 'u1');
    expect(listensQ.eq).toHaveBeenCalledWith('is_valid', true);
    expect(listensQ.gte).toHaveBeenCalledWith('created_at', SEASON.starts_at);
    expect(listensQ.lte).not.toHaveBeenCalled();
  });

  it('upper-bounds the count windows when the season has ended', async () => {
    const ended = { starts_at: '2026-01-01T00:00:00.000Z', ends_at: '2026-06-30T00:00:00.000Z' };
    const svc = makeService({
      seasons: [{ data: ended }],
      performances: [{ data: [] }],
      battle_votes: [{ count: 2 }],
      verified_listens: [{ count: 3 }],
      profiles: [{ data: { prediction_points: 5 } }],
    });

    await expect(buildWrappedData(svc.service, 'u1', 's1')).resolves.toEqual({
      battlesWon: 0,
      battlesLost: 0,
      votesCast: 2,
      validListens: 3,
      predictionPoints: 5,
    });

    expect(issued(svc, 'battle_votes').lte).toHaveBeenCalledWith('created_at', ended.ends_at);
    expect(issued(svc, 'verified_listens').lte).toHaveBeenCalledWith('created_at', ended.ends_at);
  });

  it('skips battle queries entirely when the user has no performances', async () => {
    const svc = makeService({
      seasons: [{ data: SEASON }],
      performances: [{ data: null }],
      battle_votes: [{ count: 4 }],
      verified_listens: [{ count: 9 }],
      profiles: [{ data: null }], // no profile row → 0 prediction points
    });

    await expect(buildWrappedData(svc.service, 'u1', 's1')).resolves.toEqual({
      battlesWon: 0,
      battlesLost: 0,
      votesCast: 4,
      validListens: 9,
      predictionPoints: 0,
    });
    expect(svc.from).not.toHaveBeenCalledWith('battles');
  });

  it('treats null counts and a season with no closed battles as zeros', async () => {
    const svc = makeService({
      seasons: [{ data: SEASON }],
      performances: [{ data: [{ id: 'p1' }] }],
      battles: [{ data: [] }],
      battle_votes: [{ count: null }],
      verified_listens: [{ count: null }],
      profiles: [{ data: { prediction_points: 0 } }],
    });

    await expect(buildWrappedData(svc.service, 'u1', 's1')).resolves.toEqual(ZERO);
    // No battles → the winner-recount votes query is skipped; the only
    // battle_votes query is the votesCast count.
    expect(svc.queries.battle_votes).toHaveLength(1);
  });
});
