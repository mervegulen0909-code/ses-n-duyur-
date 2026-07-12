import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/adapters/scoring', async () => {
  const { CRITERIA } = await import('@voxscore/scoring');
  return {
    getScoringProvider: () => ({
      score: async () => ({
        initialAiScore: 73.5,
        breakdown: Object.fromEntries(CRITERIA.map((criterion) => [criterion, 73.5])),
        provisional: true,
        model: 'mock-provisional-v0',
        provider: 'mock',
      }),
    }),
  };
});

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
    fetchCaptionText: vi.fn(async () => null),
  };
});

import { fetchOEmbed } from '@voxscore/core';
import {
  createScoredPerformance,
  DuplicateVideoError,
  OEmbedFetchError,
} from './performance-create';

const YOUTUBE_URL = 'https://youtu.be/dQw4w9WgXcQ';

function makeServiceClient(
  opts: {
    createResult?: { data: string | null; error: unknown };
    songsTable?: unknown;
    openSeasonId?: string | null;
    calibrationRows?: { criterion: string; offset_value: number }[];
  } = {},
) {
  const createRpc = vi.fn(async () => opts.createResult ?? { data: 'perf-ok', error: null });
  const rpc = vi.fn(async (name: string) =>
    name === 'create_scored_performance_atomic' ? createRpc() : { data: null, error: null },
  );

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
  const seasons = {
    select: vi.fn(() => ({
      is: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: opts.openSeasonId ? { id: opts.openSeasonId } : null,
            })),
          })),
        })),
      })),
    })),
  };
  const calibration = {
    select: vi.fn(async () => ({ data: opts.calibrationRows ?? [] })),
  };
  const from = vi.fn((table: string) => {
    if (table === 'songs') return opts.songsTable ?? defaultSongs;
    if (table === 'seasons') return seasons;
    if (table === 'scoring_calibration') return calibration;
    throw new Error(`unexpected table: ${table}`);
  });
  return { client: { from, rpc } as never, rpc, createRpc };
}

describe('createScoredPerformance — atomic performance + score persistence', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('creates performance and score through one transactional RPC', async () => {
    const service = makeServiceClient({ openSeasonId: 'season-open' });

    const result = await createScoredPerformance(service.client, {
      userId: 'requester-42',
      youtubeUrl: YOUTUBE_URL,
      songId: 'song-existing',
    });

    expect(result).toEqual({ id: 'perf-ok' });
    expect(service.rpc).toHaveBeenCalledWith(
      'create_scored_performance_atomic',
      expect.objectContaining({
        p_user_id: 'requester-42',
        p_song_id: 'song-existing',
        p_youtube_video_id: 'dQw4w9WgXcQ',
        p_initial_ai_score: 73.5,
        p_ai_breakdown_raw: expect.objectContaining({ vocalAccuracy: 73.5 }),
        p_season_id: 'season-open',
      }),
    );
    expect(service.rpc).toHaveBeenCalledWith('grant_badge', {
      p_user_id: 'requester-42',
      p_badge_key: 'first_performance',
    });
  });

  it('surfaces an atomic failure without granting a badge', async () => {
    const service = makeServiceClient({
      createResult: { data: null, error: { message: 'score insert failed' } },
    });

    await expect(
      createScoredPerformance(service.client, { userId: 'user-1', youtubeUrl: YOUTUBE_URL }),
    ).rejects.toThrow('Could not create scored performance');
    expect(service.createRpc).toHaveBeenCalledTimes(1);
    expect(service.rpc).not.toHaveBeenCalledWith('grant_badge', expect.anything());
  });

  it('maps the unique video constraint to DuplicateVideoError', async () => {
    const service = makeServiceClient({
      createResult: { data: null, error: { code: '23505', message: 'duplicate' } },
    });
    await expect(
      createScoredPerformance(service.client, { userId: 'user-1', youtubeUrl: YOUTUBE_URL }),
    ).rejects.toThrow(DuplicateVideoError);
  });

  it('throws OEmbedFetchError before any DB mutation when metadata fails', async () => {
    vi.mocked(fetchOEmbed).mockRejectedValueOnce(new Error('oEmbed down'));
    const service = makeServiceClient();
    await expect(
      createScoredPerformance(service.client, { userId: 'user-1', youtubeUrl: YOUTUBE_URL }),
    ).rejects.toThrow(OEmbedFetchError);
    expect(service.createRpc).not.toHaveBeenCalled();
  });

  it('auto-resolves and links the normalized song with its category', async () => {
    vi.mocked(fetchOEmbed).mockResolvedValueOnce({
      title: 'Adele - Hello (Cover by Jane)',
      authorName: 'Jane Doe',
      authorUrl: 'https://youtube.com/@jane',
      thumbnailUrl: 'https://img/t.jpg',
      providerName: 'YouTube',
    });
    const songInsert = vi.fn(() => ({
      select: () => ({ single: async () => ({ data: { id: 'song-1' }, error: null }) }),
    }));
    const service = makeServiceClient({
      songsTable: {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
        insert: songInsert,
      },
    });

    await createScoredPerformance(service.client, {
      userId: 'user-1',
      youtubeUrl: YOUTUBE_URL,
      category: 'ballad',
    });

    expect(songInsert).toHaveBeenCalledWith({
      title: 'Hello',
      artist: 'Adele',
      normalized_key: 'adele :: hello',
      category: 'ballad',
    });
    expect(service.rpc).toHaveBeenCalledWith(
      'create_scored_performance_atomic',
      expect.objectContaining({ p_song_id: 'song-1' }),
    );
  });

  it('persists calibrated and raw breakdowns independently', async () => {
    const service = makeServiceClient({
      calibrationRows: [{ criterion: 'vocalAccuracy', offset_value: 10 }],
    });

    await createScoredPerformance(service.client, { userId: 'user-1', youtubeUrl: YOUTUBE_URL });

    expect(service.rpc).toHaveBeenCalledWith(
      'create_scored_performance_atomic',
      expect.objectContaining({
        p_initial_ai_score: 75.5,
        p_ai_breakdown: expect.objectContaining({ vocalAccuracy: 83.5 }),
        p_ai_breakdown_raw: expect.objectContaining({ vocalAccuracy: 73.5 }),
      }),
    );
  });

  it('stamps a null season when none is open', async () => {
    const service = makeServiceClient();
    await createScoredPerformance(service.client, { userId: 'user-1', youtubeUrl: YOUTUBE_URL });
    expect(service.rpc).toHaveBeenCalledWith(
      'create_scored_performance_atomic',
      expect.objectContaining({ p_season_id: null }),
    );
  });
});
