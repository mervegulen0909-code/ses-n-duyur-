import { assertFinite } from './util';

/**
 * Vote-count → (AI weight, Listener weight) tiers, straight from the product
 * spec. As verified votes accumulate, trust shifts from the AI estimate to the
 * crowd. Weights in each tier sum to 1.0.
 *
 * @deprecated Regime v4 replaced the step tiers with the smooth
 * {@link listenerWeightForVotes} curve; kept for historical reference and to
 * keep old regime docs readable.
 */
export interface VoteWeightTier {
  readonly minVotes: number;
  readonly maxVotes: number;
  readonly aiWeight: number;
  readonly listenerWeight: number;
}

export const VOTE_WEIGHT_TIERS: readonly VoteWeightTier[] = [
  { minVotes: 0, maxVotes: 0, aiWeight: 1.0, listenerWeight: 0.0 },
  { minVotes: 1, maxVotes: 25, aiWeight: 0.85, listenerWeight: 0.15 },
  { minVotes: 26, maxVotes: 100, aiWeight: 0.75, listenerWeight: 0.25 },
  { minVotes: 101, maxVotes: 500, aiWeight: 0.65, listenerWeight: 0.35 },
  { minVotes: 501, maxVotes: 2000, aiWeight: 0.55, listenerWeight: 0.45 },
  { minVotes: 2001, maxVotes: Number.POSITIVE_INFINITY, aiWeight: 0.45, listenerWeight: 0.55 },
];

export interface ScoreWeights {
  readonly aiWeight: number;
  readonly listenerWeight: number;
}

/**
 * Smooth Bayesian-shrinkage listener weight: lw = min(cap(n), n / (n + K)).
 * Replaces the step tiers (regime v4): no discontinuities between adjacent
 * vote counts, and a single early vote has ~1.6% influence instead of 15% —
 * verified votes are expensive (real listen time), so crowd trust converging
 * by ~75 votes is deliberate.
 *
 * The cap itself relaxes with scale: 0.55 up to 200 votes, then rising
 * linearly to 0.75 at 1000+. A provisional metadata estimate should anchor a
 * small crowd, but it must not permanently overrule a very large honest one.
 */
export const BLEND_PRIOR_STRENGTH = 60;
export const LISTENER_WEIGHT_CAP = 0.55;
export const PROVISIONAL_CAP_RELAX_START = 200;
export const PROVISIONAL_CAP_RELAX_RANGE = 800;
export const PROVISIONAL_CAP_RELAX_MAX = 0.2;

export function listenerWeightCapForVotes(verifiedVotes: number): number {
  assertFinite(verifiedVotes, 'verifiedVotes');
  if (verifiedVotes < 0) throw new RangeError('verifiedVotes must be >= 0');
  const n = Math.floor(verifiedVotes);
  const relax = Math.min(
    1,
    Math.max(0, n - PROVISIONAL_CAP_RELAX_START) / PROVISIONAL_CAP_RELAX_RANGE,
  );
  return LISTENER_WEIGHT_CAP + PROVISIONAL_CAP_RELAX_MAX * relax;
}

export function listenerWeightForVotes(verifiedVotes: number): number {
  assertFinite(verifiedVotes, 'verifiedVotes');
  if (verifiedVotes < 0) throw new RangeError('verifiedVotes must be >= 0');
  const n = Math.floor(verifiedVotes);
  if (n <= 0) return 0;
  return Math.min(listenerWeightCapForVotes(n), n / (n + BLEND_PRIOR_STRENGTH));
}

/**
 * Resolve the (AI, Listener) weights for a given count of VERIFIED votes.
 * Only verified votes count — callers must pass the verified total, not raw.
 *
 * @deprecated Regime v4 uses {@link listenerWeightForVotes}.
 */
export function weightForVotes(verifiedVotes: number): ScoreWeights {
  assertFinite(verifiedVotes, 'verifiedVotes');
  if (verifiedVotes < 0) throw new RangeError('verifiedVotes must be >= 0');
  const v = Math.floor(verifiedVotes);

  for (const tier of VOTE_WEIGHT_TIERS) {
    if (v >= tier.minVotes && v <= tier.maxVotes) {
      return { aiWeight: tier.aiWeight, listenerWeight: tier.listenerWeight };
    }
  }
  // Unreachable: the final tier extends to +Infinity. Guard for safety.
  /* v8 ignore next 2 */
  throw new Error(`no weight tier matched verifiedVotes=${v}`);
}
