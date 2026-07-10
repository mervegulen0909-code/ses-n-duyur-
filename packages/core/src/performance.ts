import type { CriteriaScores } from '@voxscore/scoring';
import { parseYouTubeId } from './youtube';
import type { OEmbedMetadata } from './youtube';
import type { ScoringResult } from './adapters/scoring-provider';

/** Row payloads ready to persist for a newly added YouTube performance. */
export interface PerformanceCreate {
  readonly performance: {
    readonly user_id: string;
    readonly song_id: string | null;
    readonly source: 'youtube';
    readonly youtube_video_id: string;
    readonly oembed_meta: OEmbedMetadata;
    readonly has_video: boolean;
    readonly duration_s: number | null;
  };
  /** Initial score row. With 0 votes, current === initial and trend === 0. */
  readonly score: {
    readonly scoring_version: number;
    readonly initial_ai_score: number;
    readonly ai_breakdown: CriteriaScores;
    readonly is_provisional: boolean;
    readonly listener_score: null;
    readonly current_score: number;
    readonly trend_score: number;
    readonly verified_vote_count: 0;
  };
}

export interface BuildPerformanceParams {
  readonly userId: string;
  readonly youtubeUrl: string;
  readonly oembed: OEmbedMetadata;
  readonly scoring: ScoringResult;
  readonly songId?: string | null;
  readonly hasVideo?: boolean;
  readonly durationS?: number | null;
}

/**
 * Compose the DB insert payloads for a new performance from validated input,
 * fetched oEmbed metadata, and a scoring result. Pure — no I/O.
 *
 * Throws if the URL is not a parseable YouTube video URL (caller should have
 * already validated with `addPerformanceSchema`, this is a defensive guard).
 */
export function buildPerformanceCreate(params: BuildPerformanceParams): PerformanceCreate {
  const videoId = parseYouTubeId(params.youtubeUrl);
  if (videoId === null) {
    throw new Error('buildPerformanceCreate: not a valid YouTube video URL');
  }

  const hasVideo = params.hasVideo ?? true;

  return {
    performance: {
      user_id: params.userId,
      song_id: params.songId ?? null,
      source: 'youtube',
      youtube_video_id: videoId,
      oembed_meta: params.oembed,
      has_video: hasVideo,
      duration_s: params.durationS ?? null,
    },
    score: {
      // v2 (2026-07-10): deterministic scoring regime — pinned model snapshots,
      // temperature 0, rubric-anchored prompt, scores quantized to multiples
      // of 5. v1 scores predate those guarantees; keep them distinguishable.
      scoring_version: 2,
      initial_ai_score: params.scoring.initialAiScore,
      ai_breakdown: params.scoring.breakdown,
      is_provisional: params.scoring.provisional,
      listener_score: null,
      // 0 verified votes → current equals the AI score, trend is flat.
      current_score: params.scoring.initialAiScore,
      trend_score: 0,
      verified_vote_count: 0,
    },
  };
}
