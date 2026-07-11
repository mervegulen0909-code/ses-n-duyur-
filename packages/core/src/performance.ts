import type { CriteriaScores } from '@voxscore/scoring';
import { parseYouTubeId } from './youtube';
import type { OEmbedMetadata } from './youtube';
import { SCORING_VERSION } from './adapters/scoring-provider';
import type { ScoringProviderName, ScoringResult } from './adapters/scoring-provider';

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
    readonly ai_provider: ScoringProviderName;
    readonly ai_model: string;
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
      // Centralized regime version — see SCORING_VERSION in
      // adapters/scoring-provider.ts for what a bump means.
      scoring_version: SCORING_VERSION,
      initial_ai_score: params.scoring.initialAiScore,
      ai_breakdown: params.scoring.breakdown,
      is_provisional: params.scoring.provisional,
      // Provenance: which backend actually produced these numbers (a silent
      // fallback to mock is recorded as mock, never hidden).
      ai_provider: params.scoring.provider,
      ai_model: params.scoring.model,
      listener_score: null,
      // 0 verified votes → current equals the AI score, trend is flat.
      current_score: params.scoring.initialAiScore,
      trend_score: 0,
      verified_vote_count: 0,
    },
  };
}
