import { assertFinite } from './util';

/** Default K-factor for battle Elo updates (MVP). */
export const DEFAULT_K_FACTOR = 32;

/** Battle outcome from the perspective of player A. */
export type MatchResult = 1 | 0.5 | 0;

/**
 * Expected score (win probability) of `ratingA` against `ratingB`,
 * per the standard logistic Elo curve. Returns a value in (0, 1).
 */
export function expectedScore(ratingA: number, ratingB: number): number {
  assertFinite(ratingA, 'ratingA');
  assertFinite(ratingB, 'ratingB');
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

/**
 * New Elo rating for a player after one match.
 * `result` is 1 (win), 0.5 (draw), or 0 (loss) for THIS player.
 */
export function updateRating(
  rating: number,
  opponentRating: number,
  result: MatchResult,
  k: number = DEFAULT_K_FACTOR,
): number {
  assertFinite(rating, 'rating');
  assertFinite(k, 'k');
  if (k <= 0) throw new RangeError('k must be > 0');
  // The type says 1 | 0.5 | 0, but JS callers can pass anything — an
  // out-of-band result (NaN, 7, -1) would silently corrupt the rating instead
  // of failing loudly like every other guarded input in this package.
  assertFinite(result, 'result');
  if (result < 0 || result > 1) throw new RangeError('result must be within [0, 1]');
  const expected = expectedScore(rating, opponentRating);
  return rating + k * (result - expected);
}

export interface BattleEloResult {
  readonly ratingA: number;
  readonly ratingB: number;
}

/**
 * Apply one battle result to both players' ratings.
 * `resultForA` is from A's perspective (1 = A wins, 0 = B wins, 0.5 = draw).
 */
export function applyBattle(
  ratingA: number,
  ratingB: number,
  resultForA: MatchResult,
  k: number = DEFAULT_K_FACTOR,
): BattleEloResult {
  const resultForB: MatchResult = (1 - resultForA) as MatchResult;
  return {
    ratingA: updateRating(ratingA, ratingB, resultForA, k),
    ratingB: updateRating(ratingB, ratingA, resultForB, k),
  };
}
