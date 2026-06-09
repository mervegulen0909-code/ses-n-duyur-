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
    created_at: Timestamp;
  };
  songs: {
    id: Uuid;
    title: string;
    artist: string | null;
    normalized_key: string | null;
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
    is_provisional: boolean;
    listener_score: number | null;
    current_score: number | null;
    trend_score: number | null;
    verified_vote_count: number;
    updated_at: Timestamp;
  };
  verified_listens: {
    id: Uuid;
    user_id: Uuid;
    performance_id: Uuid;
    watched_pct: number;
    events: Json | null;
    is_valid: boolean;
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
  comments: {
    id: Uuid;
    performance_id: Uuid;
    user_id: Uuid;
    body: string;
    created_at: Timestamp;
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
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof PublicRows> = PublicRows[T];
