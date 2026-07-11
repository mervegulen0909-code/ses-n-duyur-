import { z } from 'zod';

/**
 * Controlled song/performance categories. The single source of truth shared by
 * the DB check constraint (supabase/migrations/20260711130000_*), the Zod
 * schemas, and every category picker UI — free-form category strings must
 * never reach the database.
 */
export const SONG_CATEGORIES = [
  'pop',
  'rock',
  'rnb-soul',
  'ballad',
  'turkish-global',
  'indie-alternative',
  'musical-classical',
  'other',
] as const;
export type SongCategory = (typeof SONG_CATEGORIES)[number];

export const songCategorySchema = z.enum(SONG_CATEGORIES);

/** Vocal difficulty bands for the launch catalog and discovery filters. */
export const SONG_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type SongDifficulty = (typeof SONG_DIFFICULTIES)[number];

export const songDifficultySchema = z.enum(SONG_DIFFICULTIES);

export function isSongCategory(value: string | null | undefined): value is SongCategory {
  return !!value && (SONG_CATEGORIES as readonly string[]).includes(value);
}
