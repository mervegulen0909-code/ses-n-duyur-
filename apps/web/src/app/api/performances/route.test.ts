import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Module mocks (hoisted above imports by Vitest) -------------------------

// Supabase client factories — controlled per-test via vi.mocked(...).
// getRequestContext resolves the request's authed user + RLS-scoped client
// (cookie OR bearer); the route no longer calls createSupabaseServerClient
// directly, so we mock the context resolver instead.
vi.mock('@/lib/supabase/server', () => ({
  getRequestContext: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}));

// Guards pass through (rate-limit / bot-check are covered elsewhere). null = "not blocked".
vi.mock('@/lib/guard', () => ({
  rateLimit: vi.fn(async () => null),
  botGuard: vi.fn(async () => null),
}));

// Deterministic provisional scoring — no network, no OpenAI call.
vi.mock('@/lib/adapters/scoring', async () => {
  const { CRITERIA } = await import('@voxscore/scoring');
  return {
    getScoringProvider: () => ({
      score: async () => ({
        initialAiScore: 73.5,
        breakdown: Object.fromEntries(CRITERIA.map((c) => [c, 73.5])),
        provisional: true,
        model: 'mock-provisional-v0',
      }),
    }),
  };
});

// Keep the REAL core (schema, parseYouTubeId, buildPerformanceCreate) and stub
// only the networked oEmbed read. Embed-only rule stays intact: we still fetch
// metadata only, never media.
vi.mock('@voxscore/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@voxscore/core')>();
  return {
    ...actual,
    fetchOEmbed: vi.fn(async () => ({
      title: 'My Cover',
      authorName: 'Singer',
      authorUrl: 'https://youtube.com/@singer',
      thumbnailUrl: 'https://img/t.jpg',
      providerName: 'YouTube',
    })),
  };
});

import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { fetchOEmbed } from '@voxscore/core';
import { POST } from './route';

const VALID_BODY = { youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' };

function makeRequest(body: unknown = VALID_BODY): Request {
  return new Request('http://localhost/api/performances', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Typed casts so the fakes satisfy the mocked factories without `any`.
type RequestCtx = Awaited<ReturnType<typeof getRequestContext>>;
type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

// User-scoped request context whose performance insert succeeds with a row id.
// `from` is a spy, so a test can assert whether a performance was ever created.
function makeUserClient(perfId = 'perf-123') {
  const single = vi.fn(async () => ({ data: { id: perfId }, error: null }));
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ insert }));
  const supabase = { from };
  const ctx = { supabase, user: { id: 'user-1' } };
  return { ctx: ctx as unknown as RequestCtx, from, insert };
}

// Service client: `scores` insert resolves to `scoreResult`; `performances`
// delete (the rollback) resolves to `deleteResult` (defaults to success).
function makeServiceClient(opts: {
  scoreResult: { error: unknown };
  deleteResult?: { error: unknown };
}) {
  const eq = vi.fn(async () => opts.deleteResult ?? { error: null });
  const del = vi.fn(() => ({ eq }));
  const insert = vi.fn(async () => opts.scoreResult);
  const from = vi.fn((table: string) => (table === 'scores' ? { insert } : { delete: del }));
  return { client: { from } as unknown as ServiceClient, from, insert, del, eq };
}

describe('POST /api/performances — score persistence is not best-effort', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  // Failure path 1: SUPABASE_SERVICE_ROLE_KEY missing/invalid → service is null.
  it('returns 503 and creates NO performance when the service client is missing', async () => {
    const user = makeUserClient();
    vi.mocked(getRequestContext).mockResolvedValue(user.ctx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(null);

    const res = await POST(makeRequest());

    expect(res.status).toBe(503);
    // The whole point: we never insert an orphan, scoreless performance.
    expect(user.from).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  // Failure path 2: the score insert returns an error.
  it('rolls back the performance and returns 500 when the score insert errors', async () => {
    const user = makeUserClient('perf-err');
    const service = makeServiceClient({ scoreResult: { error: { message: 'insert boom' } } });
    vi.mocked(getRequestContext).mockResolvedValue(user.ctx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.client);

    const res = await POST(makeRequest());

    expect(res.status).toBe(500);
    expect(user.insert).toHaveBeenCalledTimes(1); // performance was created...
    expect(service.insert).toHaveBeenCalledTimes(1); // ...score insert attempted...
    expect(service.del).toHaveBeenCalledTimes(1); // ...and rolled back.
    expect(service.eq).toHaveBeenCalledWith('id', 'perf-err');
    expect(errorSpy).toHaveBeenCalled();
  });

  // Worst case: insert fails AND the rollback fails → a real orphan. Must be loud.
  it('logs a loud orphan warning when the score insert AND the rollback both fail', async () => {
    const user = makeUserClient('perf-orphan');
    const service = makeServiceClient({
      scoreResult: { error: { message: 'insert boom' } },
      deleteResult: { error: { message: 'delete boom' } },
    });
    vi.mocked(getRequestContext).mockResolvedValue(user.ctx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.client);

    const res = await POST(makeRequest());

    expect(res.status).toBe(500);
    expect(service.del).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls.some((c) => String(c[0]).includes('ROLLBACK FAILED'))).toBe(true);
  });

  // Same-song matchmaking: a recognizable title auto-links a songs row and the
  // performance is inserted with that song_id (battles pair same-song first).
  it('auto-resolves the song and inserts the performance with its song_id', async () => {
    vi.mocked(fetchOEmbed).mockResolvedValueOnce({
      title: 'Adele - Hello (Cover by Jane)',
      authorName: 'Jane Doe',
      authorUrl: 'https://youtube.com/@jane',
      thumbnailUrl: 'https://img/t.jpg',
      providerName: 'YouTube',
    });

    const single = vi.fn(async () => ({ data: { id: 'perf-song' }, error: null }));
    const perfInsert = vi.fn(() => ({ select: vi.fn(() => ({ single })) }));
    const ctx = {
      supabase: { from: vi.fn(() => ({ insert: perfInsert })) },
      user: { id: 'user-1' },
    } as unknown as RequestCtx;

    // Service client: no existing song → insert creates song-1; score insert ok.
    const songMaybeSingle = vi.fn(async () => ({ data: null, error: null }));
    const songInsertSingle = vi.fn(async () => ({ data: { id: 'song-1' }, error: null }));
    const songsTable = {
      select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: songMaybeSingle })) })),
      insert: vi.fn(() => ({ select: vi.fn(() => ({ single: songInsertSingle })) })),
    };
    const serviceFrom = vi.fn((table: string) =>
      table === 'songs' ? songsTable : { insert: vi.fn(async () => ({ error: null })) },
    );
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue({
      from: serviceFrom,
    } as unknown as ServiceClient);

    const res = await POST(makeRequest());

    expect(res.status).toBe(201);
    // The song row was upserted with the canonical name + normalized key...
    expect(songsTable.insert).toHaveBeenCalledWith({
      title: 'Hello',
      artist: 'Adele',
      normalized_key: 'adele :: hello',
    });
    // ...and the performance carries the resolved song_id.
    expect(perfInsert).toHaveBeenCalledWith(expect.objectContaining({ song_id: 'song-1' }));
  });

  // One video = one league entry (and one AI score): unique-violation → 409.
  it('returns 409 when the same video is already in the league (unique violation)', async () => {
    const single = vi.fn(async () => ({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    }));
    const insert = vi.fn(() => ({ select: vi.fn(() => ({ single })) }));
    const ctx = {
      supabase: { from: vi.fn(() => ({ insert })) },
      user: { id: 'user-1' },
    } as unknown as RequestCtx;
    const service = makeServiceClient({ scoreResult: { error: null } });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.client);

    const res = await POST(makeRequest());

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: 'This video is already in the league' });
    // No score write, no rollback — nothing was created.
    expect(service.insert).not.toHaveBeenCalled();
    expect(service.del).not.toHaveBeenCalled();
  });

  // Regression guard: the happy path still returns 201 and never rolls back/logs.
  it('returns 201 with the new id when the score persists cleanly', async () => {
    const user = makeUserClient('perf-ok');
    const service = makeServiceClient({ scoreResult: { error: null } });
    vi.mocked(getRequestContext).mockResolvedValue(user.ctx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.client);

    const res = await POST(makeRequest());

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ id: 'perf-ok' });
    expect(service.insert).toHaveBeenCalledTimes(1);
    expect(service.del).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
