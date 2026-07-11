import {
  CRITERIA,
  currentScore,
  DEFAULT_CRITERION_WEIGHTS,
  listenerScore,
  round,
  trendScore,
  type Criterion,
} from '@voxscore/scoring';

/**
 * Criterion-weighted mean of the provided ratings → a single 0–100 "overall".
 * Uses the SAME weights as the AI composition (renormalized over the criteria
 * actually present) so both blend inputs measure the same thing (regime v4).
 */
export function criteriaOverall(ratings: Partial<Record<Criterion, number>>): number | null {
  let weightSum = 0;
  let weighted = 0;
  for (const c of CRITERIA) {
    const v = ratings[c];
    if (typeof v !== 'number') continue;
    const w = DEFAULT_CRITERION_WEIGHTS[c];
    weightSum += w;
    weighted += v * w;
  }
  if (weightSum <= 0) return null;
  return round(weighted / weightSum, 2);
}

export interface ScoreRecomputeInput {
  readonly initialAiScore: number;
  /** Optional user-facing baseline; defaults to the effective initial score. */
  readonly trendBaseline?: number;
  /** One "overall" 0–100 per verified vote. */
  readonly voteOveralls: readonly number[];
}

export interface ScoreRecompute {
  readonly listenerScore: number | null;
  readonly currentScore: number;
  readonly trendScore: number;
  readonly verifiedVoteCount: number;
}

/**
 * Recompute the denormalized score row from the AI start score + all verified
 * vote overalls. Wraps the pure scoring math (vote-weighted blend).
 */
export function recomputeScore(input: ScoreRecomputeInput): ScoreRecompute {
  const trendBaseline = input.trendBaseline ?? input.initialAiScore;
  if (trendBaseline < 0 || trendBaseline > 100 || !Number.isFinite(trendBaseline)) {
    throw new RangeError('trendBaseline must be within [0, 100]');
  }
  const votes = input.voteOveralls.map((overall) => ({ overall }));
  const listener = listenerScore(votes);
  const current = currentScore({
    initialAiScore: input.initialAiScore,
    listenerScore: listener,
    verifiedVotes: votes.length,
  });
  return {
    listenerScore: listener,
    currentScore: current,
    trendScore: trendScore(current, trendBaseline),
    verifiedVoteCount: votes.length,
  };
}
