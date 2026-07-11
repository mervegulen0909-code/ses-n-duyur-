import { describe, expect, it } from 'vitest';
import { confidenceForVotes } from './confidence';

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
