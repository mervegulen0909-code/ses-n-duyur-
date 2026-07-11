import 'server-only';
import {
  buildPerformanceCreate,
  fetchOEmbed,
  normalizeSongKey,
  parseYouTubeId,
} from '@voxscore/core';
import type { SongCategory } from '@voxscore/core';
import type { Json } from '@voxscore/db';
import type { createSupabaseServiceClient } from '@/lib/supabase/server';
import { getScoringProvider } from '@/lib/adapters/scoring';
import { getSongExtractor } from '@/lib/adapters/song';

type ServiceClient = NonNullable<ReturnType<typeof createSupabaseServiceClient>>;

/** The submitted video is already an active performance in the league. */
export class DuplicateVideoError extends Error {
  constructor() {
    super('This video is already in the league');
    this.name = 'DuplicateVideoError';
  }
}

/** The public YouTube oEmbed endpoint could not be reached/parsed. */
export class OEmbedFetchError extends Error {
  constructor(cause: unknown) {
    super('Could not fetch YouTube metadata');
    this.name = 'OEmbedFetchError';
    this.cause = cause;
  }
}

/**
 * Resolve which SONG this video performs and upsert it into public.songs,
 * keyed on normalized_key, so covers of the same song share a song_id (the
 * battle matcher pairs same-song performances first — the product's core
 * "who sings THIS song best" loop). Best-effort by design: any failure just
 * returns null and the performance is added without a song link.
 */
async function resolveSongId(
  service: ServiceClient,
  input: { title: string; authorName: string; category: SongCategory | null },
): Promise<string | null> {
  try {
    const guess = await getSongExtractor().extract(input);
    if (!guess) return null;
    const key = normalizeSongKey(guess.artist, guess.title);
    if (!key) return null;

    const { data: existing } = await service
      .from('songs')
      .select('id')
      .eq('normalized_key', key)
      .maybeSingle();
    if (existing) return existing.id;

    const { data: created, error } = await service
      .from('songs')
      .insert({
        title: guess.title,
        artist: guess.artist,
        normalized_key: key,
        category: input.category,
      })
      .select('id')
      .single();
    if (created) return created.id;

    // Unique-index race: another add created the song between our select and
    // insert — re-read the winner instead of dropping the link.
    if (error?.code === '23505') {
      const { data: winner } = await service
        .from('songs')
        .select('id')
        .eq('normalized_key', key)
        .maybeSingle();
      return winner?.id ?? null;
    }
    return null;
  } catch (err) {
    console.error('[performance-create] song resolution failed; adding without song link:', err);
    return null;
  }
}

export interface CreateScoredPerformanceParams {
  readonly userId: string;
  readonly youtubeUrl: string;
  /** Set on newly-resolved songs; ignored when `songId` pins an existing song. */
  readonly category?: SongCategory | null;
  readonly songId?: string | null;
}

/**
 * The shared pipeline for turning a YouTube URL into a scored, ranked
 * performance: oEmbed fetch → AI score + song resolution → insert performance
 * → insert score, rolling back the performance if the score insert fails so a
 * scoreless (unrankable) performance can never persist.
 *
 * Always writes with the SERVICE client and an explicit `userId` — this lets
 * the admin-approval path create a performance on behalf of the REQUESTER
 * (whose RLS-scoped client could never insert a row for someone else).
 */
export async function createScoredPerformance(
  service: ServiceClient,
  params: CreateScoredPerformanceParams,
): Promise<{ id: string }> {
  const videoId = parseYouTubeId(params.youtubeUrl);
  if (!videoId) {
    throw new Error('createScoredPerformance: not a valid YouTube video URL');
  }

  let oembed;
  try {
    oembed = await fetchOEmbed(videoId);
  } catch (err) {
    throw new OEmbedFetchError(err);
  }

  // Score and resolve the song concurrently — two independent LLM/API calls.
  const [scoring, resolvedSongId] = await Promise.all([
    getScoringProvider().score({
      videoId,
      title: oembed.title,
      authorName: oembed.authorName,
      hasVideo: true,
    }),
    params.songId
      ? Promise.resolve<string | null>(null) // caller pinned the song explicitly
      : resolveSongId(service, {
          title: oembed.title,
          authorName: oembed.authorName,
          category: params.category ?? null,
        }),
  ]);

  const payload = buildPerformanceCreate({
    userId: params.userId,
    youtubeUrl: params.youtubeUrl,
    oembed,
    scoring,
    songId: params.songId ?? resolvedSongId,
  });

  const { data: perf, error: perfError } = await service
    .from('performances')
    .insert({
      ...payload.performance,
      user_id: params.userId,
      oembed_meta: payload.performance.oembed_meta as unknown as Json,
    })
    .select('id')
    .single();

  if (perfError || !perf) {
    // Unique index performances_youtube_video_unique: one video = one league
    // entry (and therefore exactly one AI score). A duplicate submit is a
    // caller-facing conflict, not a server error.
    if (perfError?.code === '23505') {
      throw new DuplicateVideoError();
    }
    throw new Error('Could not create performance');
  }

  // Write the score row. If it fails, roll back the performance so we never
  // persist a performance without its score, and surface the failure instead
  // of silently swallowing it.
  const { error: scoreError } = await service.from('scores').insert({
    performance_id: perf.id,
    ...payload.score,
    ai_breakdown: payload.score.ai_breakdown as unknown as Json,
  });
  if (scoreError) {
    console.error(
      `[performance-create] score insert failed for ${perf.id}; rolling back`,
      scoreError,
    );
    const { error: rollbackError } = await service
      .from('performances')
      .delete()
      .eq('id', perf.id);
    if (rollbackError) {
      console.error(
        `[performance-create] ROLLBACK FAILED — orphaned scoreless performance ${perf.id}`,
        rollbackError,
      );
    }
    throw new Error('Could not score performance');
  }

  return { id: perf.id };
}
