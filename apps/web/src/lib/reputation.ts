import 'server-only';
import { clamp } from '@voxscore/scoring';

/**
 * Voter reputation v1 (docs/scoring-premium-plan.md T9). The dormant
 * profiles.reputation int stores the voter's trust weight ×1000; 0 (the
 * default) means "no history yet" and reads as full weight 1.0. The nightly
 * refresh-reputation cron refits it from how closely the voter's overalls
 * track each performance's consensus listener score.
 */

const MIN_WEIGHT = 0.5;
const MAX_WEIGHT = 1.5;
/** A mean absolute deviation of this many points costs a full weight unit. */
const MAD_SCALE = 25;

/** profiles.reputation → the criteria_ratings.weight to stamp on new votes. */
export function weightFromReputation(reputation: number): number {
  if (!Number.isFinite(reputation) || reputation <= 0) return 1;
  return clamp(reputation / 1000, MIN_WEIGHT, MAX_WEIGHT);
}

/** Mean |voter overall − consensus listener score| → stored reputation int. */
export function reputationFromMad(mad: number): number {
  const weight = clamp(MAX_WEIGHT - mad / MAD_SCALE, MIN_WEIGHT, MAX_WEIGHT);
  return Math.round(weight * 1000);
}
