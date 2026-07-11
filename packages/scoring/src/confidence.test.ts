import { describe, expect, it } from 'vitest';
import { confidenceForVotes, confidenceMargin } from './confidence';

describe('confidenceForVotes', () => {
  it('is aiOnly at 0 votes', () => {
    expect(confidenceForVotes(0)).toBe('aiOnly');
  });

  it('is earlyVotes for 1-9 votes', () => {
    expect(confidenceForVotes(1)).toBe('earlyVotes');
    expect(confidenceForVotes(9)).toBe('earlyVotes');
  });

  it('is communityConfirmed at 10+ votes', () => {
    expect(confidenceForVotes(10)).toBe('communityConfirmed');
    expect(confidenceForVotes(50_000)).toBe('communityConfirmed');
  });

  it('floors fractional counts', () => {
    expect(confidenceForVotes(9.9)).toBe('earlyVotes');
    expect(confidenceForVotes(10.9)).toBe('communityConfirmed');
  });

  it('throws on negative or non-finite input', () => {
    expect(() => confidenceForVotes(-1)).toThrow(RangeError);
    expect(() => confidenceForVotes(Number.NaN)).toThrow();
    expect(() => confidenceForVotes(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe('confidenceMargin — ±1.96·sd/√n interval half-width (T11)', () => {
  it('is null below 5 votes or without a stored stddev', () => {
    expect(confidenceMargin(10, 4)).toBeNull();
    expect(confidenceMargin(null, 20)).toBeNull();
  });

  it('computes the 95% margin rounded to 1 decimal', () => {
    expect(confidenceMargin(10, 25)).toBe(3.9); // 1.96·10/5 = 3.92
    expect(confidenceMargin(15, 9)).toBe(9.8); // 1.96·15/3 = 9.8
  });

  it('a zero stddev yields a zero margin (unanimous voters)', () => {
    expect(confidenceMargin(0, 10)).toBe(0);
  });

  it('rejects negative or non-finite stddev', () => {
    expect(() => confidenceMargin(-1, 10)).toThrow(RangeError);
    expect(() => confidenceMargin(Number.NaN, 10)).toThrow();
  });
});
