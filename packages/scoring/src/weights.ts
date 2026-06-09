import { assertFinite } from './util';

/**
 * Vote-count → (AI weight, Listener weight) tiers, straight from the product
 * spec. As verified votes accumulate, trust shifts from the AI estimate to the
 * crowd. Weights in each tier sum to 1.0.
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
 * Resolve the (AI, Listener) weights for a given count of VERIFIED votes.
 * Only verified votes count — callers must pass the verified total, not raw.
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
