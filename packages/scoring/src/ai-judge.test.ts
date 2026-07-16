import { describe, expect, it } from 'vitest';
import {
  AI_JUDGE_CRITERIA,
  AI_JUDGE_WEIGHTS,
  FULL_COMMUNITY_VOTES,
  communityWeightForAiJudge,
  composeAiJudgeScore,
  composeFinalAiJudgeScore,
  type AiJudgeBreakdown,
} from './ai-judge';

function scores(value: number): AiJudgeBreakdown {
  return Object.fromEntries(
    AI_JUDGE_CRITERIA.map((criterion) => [criterion, value]),
  ) as unknown as AiJudgeBreakdown;
}

describe('AI Judge score', () => {
  it('has a complete weight table that sums to one', () => {
    expect(Object.keys(AI_JUDGE_WEIGHTS)).toEqual([...AI_JUDGE_CRITERIA]);
    expect(Object.values(AI_JUDGE_WEIGHTS).reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1);
  });

  it('composes the documented criterion weights', () => {
    const breakdown = scores(0) as Record<(typeof AI_JUDGE_CRITERIA)[number], number>;
    breakdown.melodyAccuracy = 100;
    breakdown.rhythmAccuracy = 50;
    expect(composeAiJudgeScore(breakdown)).toBe(45);
    expect(composeAiJudgeScore(scores(82))).toBe(82);
  });

  it('rejects invalid criterion values', () => {
    const breakdown = scores(50) as Record<(typeof AI_JUDGE_CRITERIA)[number], number>;
    breakdown.pitchControl = Number.NaN;
    expect(() => composeAiJudgeScore(breakdown)).toThrow();
    breakdown.pitchControl = 101;
    expect(() => composeAiJudgeScore(breakdown)).toThrow(RangeError);
  });

  it('fails closed if the runtime weight table no longer sums to one', () => {
    const mutableWeights = AI_JUDGE_WEIGHTS as Record<keyof AiJudgeBreakdown, number>;
    const original = mutableWeights.dynamicPhrasing;
    mutableWeights.dynamicPhrasing = 0.2;
    try {
      expect(() => composeAiJudgeScore(scores(50))).toThrow(/weights must sum to 1/);
    } finally {
      mutableWeights.dynamicPhrasing = original;
    }
  });
});

describe('AI to community handoff', () => {
  it.each([
    [0, 0],
    [1, 0.01],
    [10, 0.1],
    [25, 0.25],
    [50, 0.5],
    [FULL_COMMUNITY_VOTES, 1],
    [1000, 1],
  ])('maps %i verified votes to %f community weight', (votes, expected) => {
    expect(communityWeightForAiJudge(votes)).toBe(expected);
  });

  it('floors fractional vote counts and rejects invalid input', () => {
    expect(communityWeightForAiJudge(25.9)).toBe(0.25);
    expect(() => communityWeightForAiJudge(-1)).toThrow(RangeError);
    expect(() => communityWeightForAiJudge(Number.POSITIVE_INFINITY)).toThrow();
  });

  it('starts with AI, blends linearly, and becomes fully community-owned', () => {
    expect(
      composeFinalAiJudgeScore({ aiJudgeScore: 80, listenerScore: null, verifiedVotes: 0 }),
    ).toBe(80);
    expect(
      composeFinalAiJudgeScore({ aiJudgeScore: 80, listenerScore: 60, verifiedVotes: 25 }),
    ).toBe(75);
    expect(
      composeFinalAiJudgeScore({ aiJudgeScore: 80, listenerScore: 60, verifiedVotes: 50 }),
    ).toBe(70);
    expect(
      composeFinalAiJudgeScore({ aiJudgeScore: 80, listenerScore: 60, verifiedVotes: 100 }),
    ).toBe(60);
    expect(
      composeFinalAiJudgeScore({ aiJudgeScore: 80, listenerScore: 60, verifiedVotes: 1000 }),
    ).toBe(60);
  });

  it('keeps the AI score when listener data is absent and validates present scores', () => {
    expect(
      composeFinalAiJudgeScore({ aiJudgeScore: 72.345, listenerScore: null, verifiedVotes: 50 }),
    ).toBe(72.35);
    expect(() =>
      composeFinalAiJudgeScore({ aiJudgeScore: 80, listenerScore: 101, verifiedVotes: 1 }),
    ).toThrow(RangeError);
    expect(() =>
      composeFinalAiJudgeScore({ aiJudgeScore: -1, listenerScore: null, verifiedVotes: 0 }),
    ).toThrow(RangeError);
  });
});
