import {
  CRITERIA,
  currentScore,
  listenerScore,
  round,
  trendScore,
  type Criterion,
} from '@voxscore/scoring';

/** Average of the provided criterion ratings → a single 0–100 "overall". */
export function criteriaOverall(ratings: Partial<Record<Criterion, number>>): number | null {
  const values = CRITERIA.map((c) => ratings[c]).filter((v): v is number => typeof v === 'number');
  if (values.length === 0) return null;
  return round(values.reduce((sum, v) => sum + v, 0) / values.length, 2);
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
