import { assertFinite, assertScore, clamp, round } from './util';
import { listenerWeightForVotes } from './weights';

/**
 * A single verified listener vote. `overall` is the 0–100 value derived from
 * the voter's per-criterion ratings (computed elsewhere). `weight` lets the
 * caller down-weight low-trust accounts (default 1).
 */
export interface ListenerVote {
  readonly overall: number;
  readonly weight?: number;
}

/**
 * Weighted mean of verified listener votes → the Listener Score (0–100).
 * Returns `null` when there are no votes (caller treats as "no listener data").
 */
export function listenerScore(votes: readonly ListenerVote[]): number | null {
  if (votes.length === 0) return null;

  let weightSum = 0;
  let weighted = 0;
  for (const [i, vote] of votes.entries()) {
    assertScore(vote.overall, `votes[${i}].overall`);
    const w = vote.weight ?? 1;
    assertFinite(w, `votes[${i}].weight`);
    if (w < 0) throw new RangeError(`votes[${i}].weight must be >= 0`);
    weightSum += w;
    weighted += vote.overall * w;
  }

  if (weightSum <= 0) return null;
  return round(weighted / weightSum, 2);
}

export interface CurrentScoreInput {
  /** Initial AI Score (0–100). */
  readonly initialAiScore: number;
  /** Listener Score (0–100) or null when there are no verified votes. */
  readonly listenerScore: number | null;
  /** Count of VERIFIED votes (drives the weight tier). */
  readonly verifiedVotes: number;
}

/**
 * Current Score = weighted blend of AI and Listener scores, where the blend
 * shifts smoothly toward the crowd as verified votes grow (regime v4:
 * lw = min(0.55, n/(n+60)) — see listenerWeightForVotes).
 *
 * With 0 verified votes (or no listener data) the result equals the AI score.
 */
export function currentScore(input: CurrentScoreInput): number {
  assertScore(input.initialAiScore, 'initialAiScore');
  const listenerWeight = listenerWeightForVotes(input.verifiedVotes);

  // No listener data → fully AI, regardless of vote count.
  if (input.listenerScore === null || input.verifiedVotes <= 0) {
    return round(input.initialAiScore, 2);
  }
  assertScore(input.listenerScore, 'listenerScore');

  const aiWeight = 1 - listenerWeight;
  const blended = aiWeight * input.initialAiScore + listenerWeight * input.listenerScore;
  return round(clamp(blended, 0, 100), 2);
}

/**
 * Trend Score = Current Score − Initial AI Score. Positive means the crowd
 * rates the performance higher than the AI did; negative means lower.
 */
export function trendScore(current: number, initial: number): number {
  assertScore(current, 'current');
  assertScore(initial, 'initial');
  return round(current - initial, 2);
}
