/**
 * Database types for the `public` schema.
 *
 * Hand-authored to match `supabase/migrations/20260609120000_init.sql`. Once a
 * local Supabase stack is running (Docker), regenerate the canonical version:
 *
 *   pnpm db:types   # supabase gen types typescript --local > this file
 *
 * Shape is compatible with `@supabase/supabase-js`'s `Database` generic.
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

type Timestamp = string; // timestamptz, ISO-8601
type Uuid = string;

export interface PublicRows {
  profiles: {
    id: Uuid;
    handle: string;
    role: 'user' | 'admin';
    reputation: number;
    reputation_fitted_at: Timestamp | null;
    prediction_points: number;
    league_tier: number;
    bio: string | null;
    avatar_url: string | null;
    links: Json | null;
    locale: 'en' | 'tr' | 'es' | 'fr' | 'ar' | 'hi' | 'zh';
    created_at: Timestamp;
  };
  songs: {
    id: Uuid;
    title: string;
    artist: string | null;
    normalized_key: string | null;
    category:
      | 'pop'
      | 'rock'
      | 'rnb-soul'
      | 'ballad'
      | 'turkish-global'
      | 'indie-alternative'
      | 'musical-classical'
      | 'other'
      | null;
    difficulty: 'easy' | 'medium' | 'hard' | null;
    created_at: Timestamp;
  };
  performances: {
    id: Uuid;
    user_id: Uuid;
    song_id: Uuid | null;
    source: 'youtube' | 'upload';
    youtube_video_id: string | null;
    oembed_meta: Json | null;
    duration_s: number | null;
    has_video: boolean;
    status: 'active' | 'hidden' | 'removed';
    elo_rating: number;
    battle_wins: number;
    battle_count: number;
    created_at: Timestamp;
  };
  scores: {
    id: Uuid;
    performance_id: Uuid;
    scoring_version: number;
    initial_ai_score: number | null;
    ai_breakdown: Json | null;
    ai_breakdown_raw: Json | null;
    is_provisional: boolean;
    listener_score: number | null;
    listener_stddev: number | null;
    current_score: number | null;
    trend_score: number | null;
    verified_vote_count: number;
    ai_provider: 'anthropic' | 'openai' | 'gemini' | 'mock' | 'voxscore-dsp' | null;
    ai_model: string | null;
    score_status:
      | 'unscored'
      | 'reference_required'
      | 'analysis_pending'
      | 'quality_rejected'
      | 'technique_only'
      | 'ai_verified'
      | 'provisional_estimate'
      | 'legacy_metadata'
      | 'analysis_failed';
    score_source:
      | 'none'
      | 'metadata_estimate'
      | 'owned_audio_ai'
      | 'ai_community_hybrid'
      | 'community';
    ai_judge_confidence: number | null;
    analysis_result_id: Uuid | null;
    season_id: Uuid | null;
    updated_at: Timestamp;
  };
  song_references: {
    id: Uuid;
    song_id: Uuid;
    status: 'draft' | 'ready' | 'retired';
    reference_version: number;
    source_type: 'licensed_midi' | 'admin_annotation';
    notes: Json;
    duration_ms: number;
    tonic_midi: number | null;
    created_by: Uuid | null;
    created_at: Timestamp;
    updated_at: Timestamp;
  };
  analysis_sessions: {
    id: Uuid;
    performance_id: Uuid;
    user_id: Uuid;
    reference_id: Uuid | null;
    mode: 'song_reference' | 'technique_test';
    status:
      | 'created'
      | 'uploading'
      | 'processing'
      | 'completed'
      | 'rejected'
      | 'failed'
      | 'expired';
    upload_nonce_hash: string;
    expires_at: Timestamp;
    attempt_count: number;
    error_code: string | null;
    error_message: string | null;
    created_at: Timestamp;
    started_at: Timestamp | null;
    completed_at: Timestamp | null;
  };
  analysis_results: {
    id: Uuid;
    session_id: Uuid;
    performance_id: Uuid;
    user_id: Uuid;
    reference_id: Uuid | null;
    pipeline_version: number;
    pitch_engine: string;
    pitch_engine_version: string;
    quality_gate: Json;
    raw_metrics: Json;
    measured_breakdown: Json | null;
    ai_score: number | null;
    confidence: number | null;
    audio_sha256: string;
    created_at: Timestamp;
  };
  measured_scores: {
    id: Uuid;
    performance_id: Uuid;
    user_id: Uuid;
    dsp_version: number;
    features: Json;
    measured_breakdown: Json;
    duration_matched: boolean | null;
    created_at: Timestamp;
    updated_at: Timestamp;
  };
  verified_listens: {
    id: Uuid;
    user_id: Uuid;
    performance_id: Uuid;
    watched_pct: number;
    events: Json | null;
    is_valid: boolean;
    ip_hash: string | null;
    created_at: Timestamp;
  };
  criteria_ratings: {
    id: Uuid;
    performance_id: Uuid;
    voter_id: Uuid;
    verified_listen_id: Uuid;
    vocal_accuracy: number | null;
    rhythm_timing: number | null;
    tone_quality: number | null;
    emotion_interpretation: number | null;
    technical_skill: number | null;
    pronunciation_diction: number | null;
    recording_quality: number | null;
    originality: number | null;
    stage_presence: number | null;
    weight: number;
    created_at: Timestamp;
  };
  battles: {
    id: Uuid;
    song_id: Uuid | null;
    perf_a: Uuid;
    perf_b: Uuid;
    status: 'open' | 'closed';
    season_id: Uuid | null;
    closed_at: Timestamp | null;
    result_for_a: number | null;
    winner_performance_id: Uuid | null;
    created_at: Timestamp;
  };
  battle_votes: {
    id: Uuid;
    battle_id: Uuid;
    voter_id: Uuid;
    winner_performance_id: Uuid;
    listen_a_id: Uuid;
    listen_b_id: Uuid;
    is_verified: boolean;
    created_at: Timestamp;
  };
  battle_predictions: {
    id: Uuid;
    battle_id: Uuid;
    user_id: Uuid;
    predicted: Uuid;
    is_correct: boolean | null;
    created_at: Timestamp;
  };
  league_cohorts: {
    id: Uuid;
    week_start: string; // date
    tier: number;
    created_at: Timestamp;
  };
  league_memberships: {
    cohort_id: Uuid;
    user_id: Uuid;
    week_start: string; // date
    points: number;
  };
  league_point_events: {
    source_kind: 'verified_listen' | 'battle_vote' | 'battle_win';
    source_id: string;
    user_id: Uuid;
    week_start: string; // date
    delta: number;
    created_at: Timestamp;
  };
  league_rotation_weeks: {
    week_start: string; // date
    movement_completed_at: Timestamp;
  };
  custom_leagues: {
    id: Uuid;
    name: string;
    join_code: string;
    owner_id: Uuid;
    created_at: Timestamp;
  };
  custom_league_members: {
    league_id: Uuid;
    user_id: Uuid;
    joined_at: Timestamp;
  };
  comments: {
    id: Uuid;
    performance_id: Uuid;
    user_id: Uuid;
    body: string;
    created_at: Timestamp;
  };
  push_tokens: {
    id: Uuid;
    user_id: Uuid;
    token: string;
    platform: 'ios' | 'android';
    created_at: Timestamp;
    updated_at: Timestamp;
  };
  admin_scores: {
    id: Uuid;
    performance_id: Uuid;
    admin_id: Uuid;
    criteria: Json;
    created_at: Timestamp;
  };
  moderation_flags: {
    id: Uuid;
    target_type: 'performance' | 'comment' | 'profile';
    target_id: Uuid;
    reporter_id: Uuid | null;
    reason: string;
    status: 'open' | 'resolved' | 'dismissed';
    created_at: Timestamp;
  };
  dmca_requests: {
    id: Uuid;
    performance_id: Uuid | null;
    claimant: string;
    details: string | null;
    status: 'open' | 'actioned' | 'rejected';
    created_at: Timestamp;
  };
  ratings_audit: {
    id: Uuid;
    actor: Uuid | null;
    action: string;
    target: string | null;
    meta: Json | null;
    created_at: Timestamp;
  };
  performance_requests: {
    id: Uuid;
    user_id: Uuid;
    youtube_video_id: string;
    youtube_url: string;
    category:
      | 'pop'
      | 'rock'
      | 'rnb-soul'
      | 'ballad'
      | 'turkish-global'
      | 'indie-alternative'
      | 'musical-classical'
      | 'other';
    note: string | null;
    status: 'pending' | 'approved' | 'rejected';
    reviewer_id: Uuid | null;
    reviewed_at: Timestamp | null;
    rejection_reason: string | null;
    approved_performance_id: Uuid | null;
    created_at: Timestamp;
  };
  featured_challenges: {
    id: Uuid;
    song_id: Uuid;
    title: string;
    starts_at: Timestamp;
    ends_at: Timestamp | null;
    created_at: Timestamp;
  };
  follows: {
    follower_id: Uuid;
    followee_id: Uuid;
    created_at: Timestamp;
  };
  appeals: {
    id: Uuid;
    user_id: Uuid;
    target_type: 'performance' | 'comment' | 'performance_request';
    target_id: Uuid;
    reason: string;
    status: 'pending' | 'upheld' | 'denied';
    reviewer_id: Uuid | null;
    reviewed_at: Timestamp | null;
    resolution_note: string | null;
    created_at: Timestamp;
  };
  appeals_audit: {
    id: Uuid;
    appeal_id: Uuid;
    actor: Uuid | null;
    action: 'submitted' | 'upheld' | 'denied';
    note: string | null;
    created_at: Timestamp;
  };
  analytics_events: {
    id: Uuid;
    event:
      | 'landing_view'
      | 'signup_started'
      | 'signup_completed'
      | 'performance_request_submitted'
      | 'performance_request_approved'
      | 'verified_listen_completed'
      | 'vote_submitted'
      | 'battle_completed'
      | 'share_clicked'
      | 'challenge_opened'
      | 'invite_converted'
      | 'share_rendered'
      | 'challenge_link_visited'
      | 'guest_battle_started'
      | 'prediction_submitted'
      | 'scoring_mock_fallback';
    session_id: Uuid;
    user_id: Uuid | null;
    meta: Json | null;
    created_at: Timestamp;
  };
  badges: {
    key: string;
    title: string;
    description: string;
    icon: string;
  };
  profile_badges: {
    id: Uuid;
    user_id: Uuid;
    badge_key: string;
    awarded_at: Timestamp;
  };
  notification_events: {
    id: Uuid;
    user_id: Uuid;
    kind:
      | 'battle_challenge'
      | 'new_vote'
      | 'rank_change'
      | 'comment_reply'
      | 'performance_request_approved'
      | 'performance_request_rejected'
      | 'day1_comeback'
      | 'league_week_started';
    meta: Json | null;
    sent_at: Timestamp | null;
    scheduled_for: Timestamp;
    delivery_status: 'pending' | 'processing' | 'sent' | 'no_tokens' | 'dead_letter';
    attempt_count: number;
    last_error: string | null;
    next_attempt_at: Timestamp;
    locked_at: Timestamp | null;
    created_at: Timestamp;
  };
  attestation_challenges: {
    id: Uuid;
    user_id: Uuid;
    purpose: 'attestation' | 'assertion';
    challenge: string;
    expires_at: Timestamp;
    consumed_at: Timestamp | null;
    created_at: Timestamp;
  };
  native_attestations: {
    key_id: string;
    user_id: Uuid;
    platform: 'ios';
    public_key_pem: string;
    receipt_base64: string;
    sign_count: number;
    created_at: Timestamp;
    updated_at: Timestamp;
  };
  seasons: {
    id: Uuid;
    key: string;
    title: string;
    starts_at: Timestamp;
    ends_at: Timestamp | null;
    created_at: Timestamp;
  };
  scoring_calibration: {
    criterion: string;
    offset_value: number;
    sample_count: number;
    fitted_at: Timestamp;
  };
}

export type Database = {
  public: {
    Tables: {
      [K in keyof PublicRows]: {
        Row: PublicRows[K];
        Insert: Partial<PublicRows[K]>;
        Update: Partial<PublicRows[K]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      advance_app_attest_counter: {
        Args: { p_key_id: string; p_user_id: Uuid; p_new_counter: number };
        Returns: boolean;
      };
      claim_notification_events: {
        Args: { p_limit?: number };
        Returns: {
          id: Uuid;
          user_id: Uuid;
          kind: PublicRows['notification_events']['kind'];
          meta: Json | null;
          attempt_count: number;
        }[];
      };
      close_battle_atomic: {
        Args: { p_battle_id: Uuid; p_cutoff: Timestamp };
        Returns: {
          closed: boolean;
          applied: boolean;
          result_for_a: number | null;
          winner_performance_id: Uuid | null;
          winner_user_id: Uuid | null;
        }[];
      };
      create_scored_performance_atomic: {
        Args: {
          p_user_id: Uuid;
          p_song_id: Uuid | null;
          p_source: 'youtube' | 'upload';
          p_youtube_video_id: string | null;
          p_oembed_meta: Json | null;
          p_duration_s: number | null;
          p_has_video: boolean;
          p_status: 'active' | 'hidden' | 'removed';
          p_scoring_version: number;
          p_initial_ai_score: number | null;
          p_ai_breakdown: Json | null;
          p_ai_breakdown_raw: Json | null;
          p_is_provisional: boolean;
          p_ai_provider: 'anthropic' | 'openai' | 'gemini' | 'mock' | 'voxscore-dsp' | null;
          p_ai_model: string | null;
          p_season_id: Uuid | null;
        };
        Returns: Uuid;
      };
      create_custom_league_atomic: {
        Args: { p_owner_id: Uuid; p_name: string; p_join_code: string };
        Returns: Uuid;
      };
      submit_vote_and_recompute: {
        Args: {
          p_voter_id: Uuid;
          p_performance_id: Uuid;
          p_verified_listen_id: Uuid;
          p_vocal_accuracy: number | null;
          p_rhythm_timing: number | null;
          p_tone_quality: number | null;
          p_emotion_interpretation: number | null;
          p_technical_skill: number | null;
          p_pronunciation_diction: number | null;
          p_recording_quality: number | null;
          p_originality: number | null;
          p_stage_presence: number | null;
          p_initial_ai_score: number;
          p_trend_baseline: number;
        };
        Returns: {
          listener_score: number | null;
          current_score: number;
          trend_score: number;
          verified_vote_count: number;
          listener_stddev: number | null;
        }[];
      };
      apply_battle_result: {
        Args: {
          p_perf_a: Uuid;
          p_perf_b: Uuid;
          p_result_for_a: number;
          p_k?: number;
        };
        Returns: { rating_a: number; rating_b: number }[];
      };
      recompute_performance_score: {
        Args: {
          p_performance_id: Uuid;
          p_initial_ai_score: number;
          p_trend_baseline: number;
        };
        Returns: {
          listener_score: number | null;
          current_score: number;
          trend_score: number;
          verified_vote_count: number;
          listener_stddev: number | null;
        }[];
      };
      finalize_ai_analysis: {
        Args: {
          p_session_id: Uuid;
          p_result: Json;
          p_ai_score: number | null;
          p_confidence: number | null;
        };
        Returns: Uuid;
      };
      expire_stale_analysis_sessions: {
        Args: { p_performance_id: Uuid };
        Returns: undefined;
      };
      publish_song_reference: {
        Args: {
          p_song_id: Uuid;
          p_source_type: 'licensed_midi' | 'admin_annotation';
          p_notes: Json;
          p_duration_ms: number;
          p_tonic_midi: number | null;
          p_created_by: Uuid;
        };
        Returns: Uuid;
      };
      grant_badge: {
        Args: {
          p_user_id: Uuid;
          p_badge_key: string;
        };
        Returns: undefined;
      };
      score_battle_predictions: {
        Args: {
          p_battle_id: Uuid;
          p_winner: Uuid;
        };
        Returns: undefined;
      };
      add_league_points: {
        Args: {
          p_user_id: Uuid;
          p_week_start: string;
          p_delta: number;
        };
        Returns: undefined;
      };
      award_league_points: {
        Args: {
          p_user_id: Uuid;
          p_week_start: string;
          p_delta: number;
          p_source_kind: 'verified_listen' | 'battle_vote' | 'battle_win';
          p_source_id: string;
        };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof PublicRows> = PublicRows[T];
