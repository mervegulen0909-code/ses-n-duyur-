import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServiceClient: vi.fn(),
}));

import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { GET, pickNextSong } from './route';

type Service = ReturnType<typeof createSupabaseServiceClient>;

const SONG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SONG_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function makeRequest(secret?: string): Request {
  return new Request('http://localhost/api/cron/rotate-challenge', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

function makeService(opts: {
  activeChallenge?: { id: string; song_id: string; starts_at: string } | null;
  perfs?: { song_id: string | null }[];
  history?: { song_id: string; starts_at: string }[];
  song?: { title: string; artist: string | null } | null;
}) {
  const activeMaybeSingle = vi.fn(async () => ({ data: opts.activeChallenge ?? null }));
  const closeIs = vi.fn(async () => ({ error: null }));
  const update = vi.fn(() => ({ is: closeIs }));
  const insert = vi.fn(async () => ({ error: null }));
  const songMaybeSingle = vi.fn(async () => ({
    data: 'song' in opts ? opts.song : { title: 'Hello', artist: 'Adele' },
  }));

  const from = vi.fn((table: string) => {
    if (table === 'featured_challenges') {
      return {
        // active-challenge probe: select().is().gt().limit().maybeSingle()
        select: vi.fn((cols: string) => {
          if (cols === 'id, song_id, starts_at') {
            return {
              is: vi.fn(() => ({
                gt: vi.fn(() => ({ limit: vi.fn(() => ({ maybeSingle: activeMaybeSingle })) })),
              })),
            };
          }
          // history: select('song_id, starts_at').order(...)
          return { order: vi.fn(async () => ({ data: opts.history ?? [] })) };
        }),
        update,
        insert,
      };
    }
    if (table === 'performances') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ not: vi.fn(async () => ({ data: opts.perfs ?? [], error: null })) })),
        })),
      };
    }
    if (table === 'songs') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: songMaybeSingle })),
        })),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });

  return { service: { from } as unknown as Service, update, closeIs, insert };
}

describe('pickNextSong — deterministic weekly rotation', () => {
  it('requires at least 2 performances', () => {
    expect(pickNextSong([{ songId: SONG_A, performances: 1, lastFeaturedAt: null }])).toBeNull();
  });

  it('prefers a never-featured song over a previously featured one', () => {
    const pick = pickNextSong([
      { songId: SONG_A, performances: 5, lastFeaturedAt: '2026-07-01T00:00:00Z' },
      { songId: SONG_B, performances: 2, lastFeaturedAt: null },
    ]);
    expect(pick?.songId).toBe(SONG_B);
  });

  it('falls back to the least-recently-featured song', () => {
    const pick = pickNextSong([
      { songId: SONG_A, performances: 2, lastFeaturedAt: '2026-07-08T00:00:00Z' },
      { songId: SONG_B, performances: 2, lastFeaturedAt: '2026-06-01T00:00:00Z' },
    ]);
    expect(pick?.songId).toBe(SONG_B);
  });

  it('breaks never-featured ties by performance count', () => {
    const pick = pickNextSong([
      { songId: SONG_B, performances: 2, lastFeaturedAt: null },
      { songId: SONG_A, performances: 6, lastFeaturedAt: null },
    ]);
    expect(pick?.songId).toBe(SONG_A);
  });
});

describe('GET /api/cron/rotate-challenge', () => {
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

  it('403 when CRON_SECRET is unset, even with a matching header', async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(makeRequest('anything'))).status).toBe(403);
  });

  it('no-op while a challenge is still mid-week', async () => {
    const svc = makeService({
      activeChallenge: { id: 'c1', song_id: SONG_A, starts_at: new Date().toISOString() },
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    const res = await GET(makeRequest('cron-test-secret'));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ rotated: false, reason: 'active-challenge' });
    expect(svc.insert).not.toHaveBeenCalled();
    expect(svc.update).not.toHaveBeenCalled();
  });

  it('rotates: closes the stale challenge and opens one for a battle-ready song', async () => {
    const svc = makeService({
      activeChallenge: null,
      perfs: [{ song_id: SONG_A }, { song_id: SONG_A }, { song_id: SONG_B }],
      history: [{ song_id: SONG_B, starts_at: '2026-07-01T00:00:00Z' }],
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    const res = await GET(makeRequest('cron-test-secret'));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { rotated: boolean; songId: string };
    // SONG_A is the only one with >=2 performances (and never featured).
    expect(body).toMatchObject({ rotated: true, songId: SONG_A });
    expect(svc.update).toHaveBeenCalledWith(
      expect.objectContaining({ ends_at: expect.any(String) }),
    );
    expect(svc.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        song_id: SONG_A,
        title: 'Who sings “Hello” best?',
        ends_at: expect.any(String),
      }),
    );
  });

  it('reports no-eligible-song when nothing has 2 performances (and never closes/opens)', async () => {
    const svc = makeService({
      activeChallenge: null,
      perfs: [{ song_id: SONG_A }, { song_id: SONG_B }],
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    const res = await GET(makeRequest('cron-test-secret'));

    await expect(res.json()).resolves.toEqual({ rotated: false, reason: 'no-eligible-song' });
    expect(svc.update).not.toHaveBeenCalled();
    expect(svc.insert).not.toHaveBeenCalled();
  });
});
