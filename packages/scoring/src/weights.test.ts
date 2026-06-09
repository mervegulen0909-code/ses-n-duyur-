import { describe, expect, it } from 'vitest';
import { VOTE_WEIGHT_TIERS, weightForVotes } from './weights';

describe('VOTE_WEIGHT_TIERS', () => {
  it('every tier sums to 1.0', () => {
    for (const tier of VOTE_WEIGHT_TIERS) {
      expect(tier.aiWeight + tier.listenerWeight).toBeCloseTo(1, 10);
    }
  });
});

describe('weightForVotes', () => {
  it('returns full AI weight at 0 votes', () => {
    expect(weightForVotes(0)).toEqual({ aiWeight: 1.0, listenerWeight: 0.0 });
  });

  it.each([
    [1, 0.85],
    [25, 0.85],
    [26, 0.75],
    [100, 0.75],
    [101, 0.65],
    [500, 0.65],
    [501, 0.55],
    [2000, 0.55],
    [2001, 0.45],
    [1_000_000, 0.45],
  ])('maps %i votes to AI weight %f', (votes, aiWeight) => {
    expect(weightForVotes(votes).aiWeight).toBe(aiWeight);
  });

  it('floors fractional vote counts', () => {
    expect(weightForVotes(25.9)).toEqual(weightForVotes(25));
  });

  it('throws on negative or non-finite input', () => {
    expect(() => weightForVotes(-1)).toThrow(RangeError);
    expect(() => weightForVotes(Number.NaN)).toThrow(TypeError);
  });
});
