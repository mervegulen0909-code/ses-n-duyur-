import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  getRequestContext: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}));
vi.mock('@/lib/guard', () => ({
  rateLimit: vi.fn(async () => null),
}));

import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { POST } from './route';

const PERF_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PERF_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const BATTLE = '11111111-1111-1111-1111-111111111111';

type RequestCtx = Awaited<ReturnType<typeof getRequestContext>>;
type Service = ReturnType<typeof createSupabaseServiceClient>;

function makeRequest(body: Record<string, unknown> = {}): Request {
  return new Request('http://localhost/api/battles/next', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// The route only uses the service client (battles are service-role insert-only);
// ctx just needs to be non-null to pass the auth gate.
const ctx = { supabase: {}, user: { id: 'me' } } as unknown as RequestCtx;

const TWO_PERFS = [
  { id: PERF_A, youtube_video_id: 'vidA', oembed_meta: { title: 'Song A' }, song_id: 'song-1' },
  { id: PERF_B, youtube_video_id: 'vidB', oembed_meta: { title: 'Song B' }, song_id: 'song-2' },
];

function makeService(
  opts: {
    perfs?: unknown[];
    battle?: Record<string, unknown> | null;
    insertError?: unknown;
    openSeasonId?: string | null;
  } = {},
): {
  service: Service;
  battleInsert: ReturnType<typeof vi.fn>;
  songIdEq: ReturnType<typeof vi.fn>;
  scoreStatusEq: ReturnType<typeof vi.fn>;
} {
  // performances: select().eq('status').not().limit(), optionally with an
  // extra .eq('song_id', songId) between .not() and .limit() when scoped.
  const limit = vi.fn(async () => ({ data: opts.perfs ?? TWO_PERFS }));
  const songIdEq = vi.fn(() => ({ limit }));
  const notChain = vi.fn(() => ({ limit, eq: songIdEq }));
  const scoreStatusEq = vi.fn(() => ({ not: notChain }));
  // battles: insert().select().single() resolves to the new row (or an error).
  const battleSingle = vi.fn(async () => ({
    data: 'battle' in opts ? opts.battle : { id: BATTLE },
    error: opts.insertError ?? null,
  }));
  const battleInsert = vi.fn(() => ({ select: () => ({ single: battleSingle }) }));
  // currentSeasonId(): seasons.select('id').is('ends_at', null).order(...).limit(1).maybeSingle()
  const seasonMaybeSingle = vi.fn(async () => ({
    data: opts.openSeasonId ? { id: opts.openSeasonId } : null,
  }));
  const seasonsTable = {
    select: vi.fn(() => ({
      is: vi.fn(() => ({
        order: vi.fn(() => ({ limit: vi.fn(() => ({ maybeSingle: seasonMaybeSingle })) })),
      })),
    })),
  };
  const from = vi.fn((table: string) => {
    if (table === 'performances') return { select: () => ({ eq: () => ({ eq: scoreStatusEq }) }) };
    if (table === 'battles') return { insert: battleInsert };
    if (table === 'seasons') return seasonsTable;
    return {};
  });
  return { service: { from } as unknown as Service, battleInsert, songIdEq, scoreStatusEq };
}

describe('POST /api/battles/next — pairing creation', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('401 when unauthenticated', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(null);
    expect((await POST(makeRequest())).status).toBe(401);
  });

  it('503 when the service client is not configured', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(null);
    expect((await POST(makeRequest())).status).toBe(503);
  });

  it('404 when there are fewer than two performances to pair', async () => {
    const { service } = makeService({ perfs: [TWO_PERFS[0]] });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service);
    expect((await POST(makeRequest())).status).toBe(404);
  });

  it('200 creates a battle and returns both sides', async () => {
    const { service, battleInsert, scoreStatusEq } = makeService();
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      battleId: string;
      a: { performanceId: string };
      b: { performanceId: string };
    };
    expect(body.battleId).toBe(BATTLE);
    // pickPair shuffles, so assert membership without depending on order.
    expect([body.a.performanceId, body.b.performanceId].sort()).toEqual([PERF_A, PERF_B].sort());
    expect(battleInsert).toHaveBeenCalledTimes(1);
    expect(scoreStatusEq).toHaveBeenCalledWith('scores.score_status', 'ai_verified');
  });

  it('stamps the battle with the currently open season (never client-supplied)', async () => {
    const { service, battleInsert } = makeService({ openSeasonId: 'season-open' });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service);

    expect((await POST(makeRequest())).status).toBe(200);
    expect(battleInsert).toHaveBeenCalledWith(
      expect.objectContaining({ season_id: 'season-open' }),
    );
  });

  it('500 when the battle insert fails', async () => {
    const { service } = makeService({ battle: null, insertError: { message: 'boom' } });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service);
    expect((await POST(makeRequest())).status).toBe(500);
  });

  it('422 on an invalid songId', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    expect((await POST(makeRequest({ songId: 'not-a-uuid' }))).status).toBe(422);
  });

  it('scopes the pairing pool to songId and never falls back globally', async () => {
    const SONG_ID = '99999999-9999-9999-9999-999999999999';
    const { service, songIdEq } = makeService();
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service);

    const res = await POST(makeRequest({ songId: SONG_ID }));

    expect(res.status).toBe(200);
    expect(songIdEq).toHaveBeenCalledWith('song_id', SONG_ID);
  });

  it('404 with a challenge-specific message when songId has fewer than 2 performances', async () => {
    const SONG_ID = '99999999-9999-9999-9999-999999999999';
    const { service } = makeService({ perfs: [TWO_PERFS[0]] });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service);

    const res = await POST(makeRequest({ songId: SONG_ID }));

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: 'Not enough performances for this challenge yet',
    });
  });
});
