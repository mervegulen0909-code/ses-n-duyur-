import { describe, expect, it } from 'vitest';
import {
  BLEND_PRIOR_STRENGTH,
  LISTENER_WEIGHT_CAP,
  listenerWeightForVotes,
  VOTE_WEIGHT_TIERS,
  weightForVotes,
} from './weights';

describe('listenerWeightForVotes — smooth n/(n+k) curve (regime v4)', () => {
  it('is 0 with no votes and tiny for the first vote (no single-vote lever)', () => {
    expect(listenerWeightForVotes(0)).toBe(0);
    expect(listenerWeightForVotes(1)).toBeCloseTo(1 / 61, 6);
  });

  it('is monotonically increasing', () => {
    let prev = -1;
    for (const n of [0, 1, 2, 5, 10, 20, 60, 100, 500]) {
      const w = listenerWeightForVotes(n);
      expect(w).toBeGreaterThanOrEqual(prev);
      prev = w;
    }
  });

  it('reaches 50% at n = k and caps at LISTENER_WEIGHT_CAP', () => {
    expect(listenerWeightForVotes(BLEND_PRIOR_STRENGTH)).toBeCloseTo(0.5, 6);
    expect(listenerWeightForVotes(100000)).toBe(LISTENER_WEIGHT_CAP);
  });

  it('rejects negatives and non-finite input', () => {
    expect(() => listenerWeightForVotes(-1)).toThrow(RangeError);
    expect(() => listenerWeightForVotes(Number.NaN)).toThrow();
  });
});

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
