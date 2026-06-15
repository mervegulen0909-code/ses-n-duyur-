/**
 * Leaderboard ordering. VoxScore is score-first: the headline ranking is the
 * Current Score, matching the product name and the mobile home screen. Battle
 * success (Wilson lower bound) is only a tiebreaker between equal scores — it no
 * longer drives the primary order.
 */

export interface LeaderboardRow {
  id: string;
  title: string;
  currentScore: number | null;
  trendScore: number | null;
  isProvisional: boolean;
  wins: number;
  battles: number;
  wilson: number;
}

/**
 * Compare two rows for the score-first leaderboard. Higher Current Score ranks
 * first; performances with no score yet sort last. Ties break by battle success
 * (Wilson lower bound), then by title so the order is stable and deterministic.
 */
export function compareByScore(a: LeaderboardRow, b: LeaderboardRow): number {
  const sa = a.currentScore ?? -1;
  const sb = b.currentScore ?? -1;
  if (sb !== sa) return sb - sa;
  if (b.wilson !== a.wilson) return b.wilson - a.wilson;
  return a.title.localeCompare(b.title);
}

/** Return a new, score-first-ranked array (does not mutate the input). */
export function rankByScore(rows: readonly LeaderboardRow[]): LeaderboardRow[] {
  return [...rows].sort(compareByScore);
}

export type TrendDirection = 'up' | 'down' | 'flat';

/**
 * Direction of a Trend Score (Current − AI start) for the leaderboard arrow.
 * Anything that rounds to 0.0 at one decimal is treated as flat (no arrow).
 */
export function trendDirection(trend: number | null): TrendDirection {
  if (trend === null || Math.abs(trend) < 0.05) return 'flat';
  return trend > 0 ? 'up' : 'down';
}

/** One row of the battle-standings (league / Elo) board. */
export interface StandingsRow {
  id: string;
  title: string;
  elo: number;
  wins: number;
  battles: number;
}

/** Win rate as a 0–100 integer percentage; 0 when there are no battles. */
export function winRate(wins: number, battles: number): number {
  if (battles <= 0) return 0;
  return Math.round((wins / battles) * 100);
}

/**
 * Battle-standings ordering — the LEAGUE axis. Rank by Elo rating (desc); ties
 * break by who has battled more (more established), then by title. This is what
 * makes the otherwise-dormant elo_rating column meaningful.
 */
export function compareByElo(a: StandingsRow, b: StandingsRow): number {
  if (b.elo !== a.elo) return b.elo - a.elo;
  if (b.battles !== a.battles) return b.battles - a.battles;
  return a.title.localeCompare(b.title);
}

/** Return a new, Elo-ranked array (does not mutate the input). */
export function rankByElo(rows: readonly StandingsRow[]): StandingsRow[] {
  return [...rows].sort(compareByElo);
}
