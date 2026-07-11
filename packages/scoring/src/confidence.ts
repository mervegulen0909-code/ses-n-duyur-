import { assertFinite, round } from './util';

/**
 * How much crowd signal backs a performance's Current Score, for the
 * "confidence hint" shown next to a score. Distinct from `weightForVotes`
 * (which drives the score math) — this is a coarse, user-facing label.
 */
export type ConfidenceLevel = 'aiOnly' | 'earlyVotes' | 'communityConfirmed';

/**
 * 0 verified votes → the score is a pure AI estimate. 1–9 → early crowd
 * signal, not yet stable. 10+ → enough independent votes to call it
 * community-confirmed.
 */
export function confidenceForVotes(verifiedVotes: number): ConfidenceLevel {
  assertFinite(verifiedVotes, 'verifiedVotes');
  if (verifiedVotes < 0) throw new RangeError('verifiedVotes must be >= 0');
  const v = Math.floor(verifiedVotes);
  if (v === 0) return 'aiOnly';
  if (v < 10) return 'earlyVotes';
  return 'communityConfirmed';
}

/** Fewer votes than this and an interval would be noise, not information. */
const MARGIN_MIN_VOTES = 5;

/**
 * Half-width of the 95% confidence interval around the listener score:
 * ±1.96·sd/√n, 1 decimal. Null when the stddev is unknown or fewer than
 * 5 votes back it — callers hide the interval instead of showing a fake one.
 */
export function confidenceMargin(
  listenerStddev: number | null,
  verifiedVotes: number,
): number | null {
  if (listenerStddev === null) return null;
  assertFinite(listenerStddev, 'listenerStddev');
  if (listenerStddev < 0) throw new RangeError('listenerStddev must be >= 0');
  assertFinite(verifiedVotes, 'verifiedVotes');
  const n = Math.floor(verifiedVotes);
  if (n < MARGIN_MIN_VOTES) return null;
  return round((1.96 * listenerStddev) / Math.sqrt(n), 1);
}
