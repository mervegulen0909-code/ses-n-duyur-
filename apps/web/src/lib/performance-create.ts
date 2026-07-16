import 'server-only';
import {
  buildPerformanceCreate,
  fetchCaptionText,
  fetchOEmbed,
  normalizeSongKey,
  parseYouTubeId,
} from '@voxscore/core';
import type { SongCategory } from '@voxscore/core';
import type { Json } from '@voxscore/db';
import type { createSupabaseServiceClient } from '@/lib/supabase/server';
import { getScoringProvider } from '@/lib/adapters/scoring';
import { getSongExtractor } from '@/lib/adapters/song';
import { grantBadge } from '@/lib/badges';
import { applyOffsets, loadCalibration } from '@/lib/calibration';
import { currentSeasonId } from '@/lib/seasons';

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

/** Repair score rows whose AI estimate exists but displayed score is missing. */
export async function repairMissingInitialScores(
  service: ServiceClient,
  performanceIds: readonly string[],
): Promise<void> {
  if (performanceIds.length === 0) return;

  const { data: rows, error } = await service
    .from('scores')
    .select('performance_id, initial_ai_score')
    .in('performance_id', [...performanceIds])
    .is('current_score', null)
    .is('listener_score', null)
    .eq('verified_vote_count', 0)
    .not('initial_ai_score', 'is', null);

  if (error) {
    console.error('[performance-create] could not find missing initial scores:', error);
    return;
  }

  await Promise.all(
    (rows ?? []).map(async (row) => {
      const { error: updateError } = await service
        .from('scores')
        .update({ current_score: row.initial_ai_score, trend_score: 0 })
        .eq('performance_id', row.performance_id)
        .is('current_score', null)
        .is('listener_score', null)
        .eq('verified_vote_count', 0);
      if (updateError) {
        console.error(
          `[performance-create] could not repair score for ${row.performance_id}:`,
          updateError,
        );
      }
    }),
  );
}

/**
 * The shared pipeline for turning a YouTube URL into a scored, ranked
 * performance: oEmbed fetch → provisional AI estimate + song resolution →
 * insert performance + score in one transaction. The estimate is explicitly
 * provisional (metadata only, never audio); the AI Judge owned-recording flow
 * later promotes the row to 'ai_verified' and replaces it.
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

  // Score (caption-enriched), resolve the song, read the open season, and
  // load the calibration offsets concurrently — four independent reads.
  const [rawScoring, resolvedSongId, seasonId, calibration] = await Promise.all([
    (async () => {
      const transcript = await fetchCaptionText(videoId);
      return getScoringProvider().score({
        videoId,
        title: oembed.title,
        authorName: oembed.authorName,
        hasVideo: true,
        transcript: transcript ?? undefined,
      });
    })(),
    params.songId
      ? Promise.resolve<string | null>(null) // caller pinned the song explicitly
      : resolveSongId(service, {
          title: oembed.title,
          authorName: oembed.authorName,
          category: params.category ?? null,
        }),
    currentSeasonId(service),
    loadCalibration(service),
  ]);

  // Human-anchor calibration: shift the LLM estimate by the fitted offsets
  // (identity when nothing has been fitted yet).
  const calibrated = applyOffsets(rawScoring.breakdown, calibration, true);
  const scoring = {
    ...rawScoring,
    breakdown: calibrated.breakdown,
    initialAiScore: calibrated.initialAiScore,
  };

  const payload = buildPerformanceCreate({
    userId: params.userId,
    youtubeUrl: params.youtubeUrl,
    oembed,
    scoring,
    songId: params.songId ?? resolvedSongId,
  });

  const { data: performanceId, error: createError } = await service.rpc(
    'create_scored_performance_atomic',
    {
      p_user_id: params.userId,
      p_song_id: payload.performance.song_id ?? null,
      p_source: payload.performance.source ?? 'youtube',
      p_youtube_video_id: payload.performance.youtube_video_id ?? null,
      p_oembed_meta: payload.performance.oembed_meta as unknown as Json,
      p_duration_s: payload.performance.duration_s ?? null,
      p_has_video: payload.performance.has_video ?? true,
      p_status: 'active',
      p_scoring_version: payload.score.scoring_version ?? 1,
      p_initial_ai_score: payload.score.initial_ai_score ?? null,
      p_ai_breakdown: payload.score.ai_breakdown as unknown as Json,
      p_ai_breakdown_raw: rawScoring.breakdown as unknown as Json,
      p_is_provisional: payload.score.is_provisional ?? true,
      p_ai_provider: payload.score.ai_provider ?? null,
      p_ai_model: payload.score.ai_model ?? null,
      p_season_id: seasonId,
    },
  );

  if (createError || !performanceId) {
    // Unique index performances_youtube_video_unique: one video = one league
    // entry (and therefore exactly one AI score). A duplicate submit is a
    // caller-facing conflict, not a server error.
    if (createError?.code === '23505') {
      throw new DuplicateVideoError();
    }
    throw new Error('Could not create scored performance');
  }

  // Server-granted only (grantBadge is idempotent — safe to call on every
  // performance, not just a caller-computed "first" one).
  await grantBadge(service, params.userId, 'first_performance');

  return { id: performanceId };
}
