import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Deterministic provisional scoring — no network, no OpenAI/Anthropic call.
vi.mock('@/lib/adapters/scoring', async () => {
  const { CRITERIA } = await import('@voxscore/scoring');
  return {
    getScoringProvider: () => ({
      score: async () => ({
        initialAiScore: 73.5,
        breakdown: Object.fromEntries(CRITERIA.map((c) => [c, 73.5])),
        provisional: true,
        model: 'mock-provisional-v0',
        provider: 'mock',
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

import { fetchOEmbed } from '@voxscore/core';
import {
  createScoredPerformance,
  DuplicateVideoError,
  OEmbedFetchError,
} from './performance-create';

const YOUTUBE_URL = 'https://youtu.be/dQw4w9WgXcQ';

// Service client whose `performances` insert resolves to `perfResult`, whose
// `scores` insert resolves to `scoreResult`, and whose `performances` delete
// (the rollback) resolves to `deleteResult` (defaults to success). `songs`
// falls back to "no existing song" + "insert succeeds" unless overridden.
function makeServiceClient(opts: {
  perfResult?: { data: { id: string } | null; error: unknown };
  scoreResult?: { error: unknown };
  deleteResult?: { error: unknown };
  songsTable?: unknown;
}) {
  const perfSingle = vi.fn(async () => opts.perfResult ?? { data: { id: 'perf-ok' }, error: null });
  const perfInsert = vi.fn(() => ({ select: vi.fn(() => ({ single: perfSingle })) }));
  const scoreInsert = vi.fn(async () => opts.scoreResult ?? { error: null });
  const eq = vi.fn(async () => opts.deleteResult ?? { error: null });
  const del = vi.fn(() => ({ eq }));
  // grantBadge('first_performance') fires on every successful score write —
  // fire-and-forget, so a bare resolved rpc is enough for every test here.
  const rpc = vi.fn(async () => ({ error: null }));

  const defaultSongs = {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })),
    })),
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({ data: { id: 'song-auto' }, error: null })),
      })),
    })),
  };

  const from = vi.fn((table: string) => {
    if (table === 'performances') return { insert: perfInsert, delete: del };
    if (table === 'scores') return { insert: scoreInsert };
    if (table === 'songs') return opts.songsTable ?? defaultSongs;
    throw new Error(`unexpected table: ${table}`);
  });

  return { client: { from, rpc } as never, from, perfInsert, scoreInsert, del, eq, rpc };
}

describe('createScoredPerformance — score persistence is not best-effort', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('rolls back the performance when the score insert errors', async () => {
    const service = makeServiceClient({
      perfResult: { data: { id: 'perf-err' }, error: null },
      scoreResult: { error: { message: 'insert boom' } },
    });

    await expect(
      createScoredPerformance(service.client, { userId: 'user-1', youtubeUrl: YOUTUBE_URL }),
    ).rejects.toThrow('Could not score performance');

    expect(service.perfInsert).toHaveBeenCalledTimes(1);
    expect(service.scoreInsert).toHaveBeenCalledTimes(1);
    expect(service.del).toHaveBeenCalledTimes(1);
    expect(service.eq).toHaveBeenCalledWith('id', 'perf-err');
    expect(errorSpy).toHaveBeenCalled();
  });

  it('logs a loud orphan warning when the score insert AND the rollback both fail', async () => {
    const service = makeServiceClient({
      perfResult: { data: { id: 'perf-orphan' }, error: null },
      scoreResult: { error: { message: 'insert boom' } },
      deleteResult: { error: { message: 'delete boom' } },
    });

    await expect(
      createScoredPerformance(service.client, { userId: 'user-1', youtubeUrl: YOUTUBE_URL }),
    ).rejects.toThrow('Could not score performance');

    expect(service.del).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls.some((c) => String(c[0]).includes('ROLLBACK FAILED'))).toBe(true);
  });

  it('auto-resolves the song, sets its category, and links the performance', async () => {
    vi.mocked(fetchOEmbed).mockResolvedValueOnce({
      title: 'Adele - Hello (Cover by Jane)',
      authorName: 'Jane Doe',
      authorUrl: 'https://youtube.com/@jane',
      thumbnailUrl: 'https://img/t.jpg',
      providerName: 'YouTube',
    });

    const songInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({ data: { id: 'song-1' }, error: null })),
      })),
    }));
    const songsTable = {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })),
      })),
      insert: songInsert,
    };
    const service = makeServiceClient({ songsTable });

    const result = await createScoredPerformance(service.client, {
      userId: 'user-1',
      youtubeUrl: YOUTUBE_URL,
      category: 'ballad',
    });

    expect(result.id).toBe('perf-ok');
    expect(songInsert).toHaveBeenCalledWith({
      title: 'Hello',
      artist: 'Adele',
      normalized_key: 'adele :: hello',
      category: 'ballad',
    });
    expect(service.perfInsert).toHaveBeenCalledWith(
      expect.objectContaining({ song_id: 'song-1', user_id: 'user-1' }),
    );
  });

  it('throws DuplicateVideoError on a unique-violation without writing a score', async () => {
    const service = makeServiceClient({
      perfResult: {
        data: null,
        error: { code: '23505', message: 'duplicate key value violates unique constraint' },
      },
    });

    await expect(
      createScoredPerformance(service.client, { userId: 'user-1', youtubeUrl: YOUTUBE_URL }),
    ).rejects.toThrow(DuplicateVideoError);

    expect(service.scoreInsert).not.toHaveBeenCalled();
    expect(service.del).not.toHaveBeenCalled();
  });

  it('throws OEmbedFetchError when the oEmbed fetch fails', async () => {
    vi.mocked(fetchOEmbed).mockRejectedValueOnce(new Error('oEmbed request failed: 404'));
    const service = makeServiceClient({});

    await expect(
      createScoredPerformance(service.client, { userId: 'user-1', youtubeUrl: YOUTUBE_URL }),
    ).rejects.toThrow(OEmbedFetchError);
    expect(service.perfInsert).not.toHaveBeenCalled();
  });

  it('returns the new id when the score persists cleanly', async () => {
    const service = makeServiceClient({});

    const result = await createScoredPerformance(service.client, {
      userId: 'user-1',
      youtubeUrl: YOUTUBE_URL,
    });

    expect(result.id).toBe('perf-ok');
    expect(service.scoreInsert).toHaveBeenCalledTimes(1);
    expect(service.del).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('grants the first_performance badge (server-granted only) on success', async () => {
    const service = makeServiceClient({});

    await createScoredPerformance(service.client, {
      userId: 'user-1',
      youtubeUrl: YOUTUBE_URL,
    });

    expect(service.rpc).toHaveBeenCalledWith('grant_badge', {
      p_user_id: 'user-1',
      p_badge_key: 'first_performance',
    });
  });

  it('does NOT grant a badge when the score insert fails (rollback path)', async () => {
    const service = makeServiceClient({
      scoreResult: { error: { message: 'insert boom' } },
    });

    await expect(
      createScoredPerformance(service.client, { userId: 'user-1', youtubeUrl: YOUTUBE_URL }),
    ).rejects.toThrow('Could not score performance');

    expect(service.rpc).not.toHaveBeenCalled();
  });

  it('creates the performance for the explicit userId, not any ambient session', async () => {
    const service = makeServiceClient({});

    await createScoredPerformance(service.client, {
      userId: 'requester-42',
      youtubeUrl: YOUTUBE_URL,
      songId: 'song-existing',
    });

    expect(service.perfInsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'requester-42', song_id: 'song-existing' }),
    );
  });
});
