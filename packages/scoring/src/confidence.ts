import { assertFinite } from './util';

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
