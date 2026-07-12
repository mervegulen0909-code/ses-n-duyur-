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
    ai_provider: 'anthropic' | 'openai' | 'gemini' | 'mock' | null;
    ai_model: string | null;
    season_id: Uuid | null;
    updated_at: Timestamp;
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
      | 'prediction_submitted';
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
      | 'day1_comeback';
    meta: Json | null;
    sent_at: Timestamp | null;
    scheduled_for: Timestamp;
    created_at: Timestamp;
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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof PublicRows> = PublicRows[T];
