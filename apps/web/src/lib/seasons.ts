import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@voxscore/db';

type Db = SupabaseClient<Database>;

export interface SeasonSummary {
  id: string;
  key: string;
  title: string;
  endsAt: string | null;
}

/**
 * The currently OPEN season's id, or null when seasons aren't in use yet.
 * "Open" means ends_at is null — POST /api/admin/seasons always closes the
 * previous open season before inserting a new one, so at most one season is
 * ever open at a time. Called at write time (score/battle creation) so new
 * rows carry the season partition marker automatically; never client-supplied.
 */
export async function currentSeasonId(client: Db): Promise<string | null> {
  const { data } = await client
    .from('seasons')
    .select('id')
    .is('ends_at', null)
    .order('starts_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/** All seasons, most recently started first — powers the leaderboard/standings switcher. */
export async function listSeasons(client: Db): Promise<SeasonSummary[]> {
  const { data } = await client
    .from('seasons')
    .select('id, key, title, ends_at')
    .order('starts_at', { ascending: false });
  return (data ?? []).map((s) => ({ id: s.id, key: s.key, title: s.title, endsAt: s.ends_at }));
}

/** The currently open season within an already-fetched list (at most one, by construction). */
export function currentSeason(seasons: readonly SeasonSummary[]): SeasonSummary | null {
  return seasons.find((s) => s.endsAt === null) ?? null;
}

/**
 * Resolve a `?season=<key>` query param (leaderboard/standings) against an
 * already-fetched season list. `'all'` is the unfiltered all-time view; a
 * missing or unrecognized key falls back to the CURRENT season — or to
 * all-time when no season has ever been opened (the pre-Seasons default).
 */
export function resolveSeason(
  seasons: readonly SeasonSummary[],
  seasonParam: string | undefined,
): SeasonSummary | null {
  if (seasonParam === 'all') return null;
  const matched = seasonParam ? seasons.find((s) => s.key === seasonParam) : undefined;
  return matched ?? currentSeason(seasons);
}
