import { describe, expect, it } from 'vitest';
import { computeStreak, streakTier } from './streak';

describe('computeStreak', () => {
  it('counts consecutive days ending today', () => {
    expect(computeStreak(['2026-07-10', '2026-07-11', '2026-07-12'], '2026-07-12')).toBe(3);
  });
  it('still alive if last listen was yesterday', () => {
    expect(computeStreak(['2026-07-10', '2026-07-11'], '2026-07-12')).toBe(2);
  });
  it('dies after a gap', () => {
    expect(computeStreak(['2026-07-09', '2026-07-10'], '2026-07-12')).toBe(0);
  });
  it('dedupes same-day listens and ignores order', () => {
    expect(
      computeStreak(['2026-07-12', '2026-07-11', '2026-07-12', '2026-07-11'], '2026-07-12'),
    ).toBe(2);
  });
  it('empty input → 0', () => {
    expect(computeStreak([], '2026-07-12')).toBe(0);
  });
});

describe('streakTier', () => {
  it.each([
    [0, 'none'],
    [2, 'none'],
    [3, 'bronze'],
    [6, 'bronze'],
    [7, 'silver'],
    [29, 'silver'],
    [30, 'gold'],
  ] as const)('%d → %s', (n, tier) => {
    expect(streakTier(n)).toBe(tier);
  });
});
