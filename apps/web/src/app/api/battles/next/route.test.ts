import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  getRequestContext: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}));

import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { POST } from './route';

const PERF_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PERF_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const BATTLE = '11111111-1111-1111-1111-111111111111';

type RequestCtx = Awaited<ReturnType<typeof getRequestContext>>;
type Service = ReturnType<typeof createSupabaseServiceClient>;

function makeRequest(): Request {
  return new Request('http://localhost/api/battles/next', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
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
  opts: { perfs?: unknown[]; battle?: Record<string, unknown> | null; insertError?: unknown } = {},
): { service: Service; battleInsert: ReturnType<typeof vi.fn> } {
  // performances: select().eq().not().limit() resolves to the active rows.
  const limit = vi.fn(async () => ({ data: opts.perfs ?? TWO_PERFS }));
  // battles: insert().select().single() resolves to the new row (or an error).
  const battleSingle = vi.fn(async () => ({
    data: 'battle' in opts ? opts.battle : { id: BATTLE },
    error: opts.insertError ?? null,
  }));
  const battleInsert = vi.fn(() => ({ select: () => ({ single: battleSingle }) }));
  const from = vi.fn((table: string) => {
    if (table === 'performances')
      return { select: () => ({ eq: () => ({ not: () => ({ limit }) }) }) };
    if (table === 'battles') return { insert: battleInsert };
    return {};
  });
  return { service: { from } as unknown as Service, battleInsert };
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
    const { service, battleInsert } = makeService();
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
  });

  it('500 when the battle insert fails', async () => {
    const { service } = makeService({ battle: null, insertError: { message: 'boom' } });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service);
    expect((await POST(makeRequest())).status).toBe(500);
  });
});
