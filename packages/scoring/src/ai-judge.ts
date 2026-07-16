import { assertFinite, assertScore, clamp, round } from './util';

export const AI_JUDGE_CRITERIA = [
  'melodyAccuracy',
  'rhythmAccuracy',
  'pitchControl',
  'noteTransitions',
  'sustainControl',
  'dynamicPhrasing',
] as const;

export type AiJudgeCriterion = (typeof AI_JUDGE_CRITERIA)[number];
export type AiJudgeBreakdown = Readonly<Record<AiJudgeCriterion, number>>;

export const AI_JUDGE_WEIGHTS: Readonly<Record<AiJudgeCriterion, number>> = {
  melodyAccuracy: 0.35,
  rhythmAccuracy: 0.2,
  pitchControl: 0.15,
  noteTransitions: 0.1,
  sustainControl: 0.1,
  dynamicPhrasing: 0.1,
};

/** Verified votes required before the public score becomes fully community-owned. */
export const FULL_COMMUNITY_VOTES = 100;
export const AI_JUDGE_SCORING_VERSION = 5;

/**
 * Minimum overall confidence (the minimum of every quality-gate confidence)
 * for an ai_verified league score. Below this the recording gets a re-record
 * verdict — never a low league score.
 */
export const AI_JUDGE_MIN_VERIFIED_CONFIDENCE = 0.75;

export function composeAiJudgeScore(breakdown: AiJudgeBreakdown): number {
  let score = 0;
  let weightSum = 0;

  for (const criterion of AI_JUDGE_CRITERIA) {
    const value = breakdown[criterion];
    assertScore(value, `breakdown.${criterion}`);
    const weight = AI_JUDGE_WEIGHTS[criterion];
    score += value * weight;
    weightSum += weight;
  }

  if (Math.abs(weightSum - 1) > Number.EPSILON * 10) {
    throw new Error(`AI judge criterion weights must sum to 1; received ${weightSum}`);
  }

  return round(clamp(score, 0, 100), 2);
}

/** Linear, versioned handoff: 0 votes = AI only; 100+ votes = community only. */
export function communityWeightForAiJudge(verifiedVotes: number): number {
  assertFinite(verifiedVotes, 'verifiedVotes');
  if (verifiedVotes < 0) throw new RangeError('verifiedVotes must be >= 0');
  const count = Math.floor(verifiedVotes);
  return clamp(count / FULL_COMMUNITY_VOTES, 0, 1);
}

export interface AiJudgeCurrentScoreInput {
  readonly aiJudgeScore: number;
  readonly listenerScore: number | null;
  readonly verifiedVotes: number;
}

export function composeFinalAiJudgeScore(input: AiJudgeCurrentScoreInput): number {
  assertScore(input.aiJudgeScore, 'aiJudgeScore');
  const communityWeight = communityWeightForAiJudge(input.verifiedVotes);

  if (communityWeight === 0 || input.listenerScore === null) {
    return round(input.aiJudgeScore, 2);
  }

  assertScore(input.listenerScore, 'listenerScore');
  return round(
    clamp(
      input.aiJudgeScore * (1 - communityWeight) + input.listenerScore * communityWeight,
      0,
      100,
    ),
    2,
  );
}
