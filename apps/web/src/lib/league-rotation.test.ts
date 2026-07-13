import { describe, expect, it } from 'vitest';
import {
  deterministicCohortPlans,
  leagueRotationCountdown,
  nextWeekStart,
  normalizeLeagueTier,
  previousWeekStart,
  rankLeagueMembers,
  splitLeagueZones,
} from './league-rotation';

describe('league week helpers', () => {
  it('moves exactly seven UTC days across month/year boundaries', () => {
    expect(previousWeekStart('2026-01-05')).toBe('2025-12-29');
    expect(nextWeekStart('2025-12-29')).toBe('2026-01-05');
  });

  it('clamps stored tiers to the supported catalog', () => {
    expect(normalizeLeagueTier(-9)).toBe(0);
    expect(normalizeLeagueTier(2.8)).toBe(2);
    expect(normalizeLeagueTier(99)).toBe(3);
  });

  it('reports a rounded-up countdown to the next UTC Monday', () => {
    expect(leagueRotationCountdown(new Date('2026-07-15T10:30:00Z'), '2026-07-13')).toEqual({
      days: 4,
      hours: 14,
      dateTime: '2026-07-20T00:00:00.000Z',
    });
  });
});

describe('league ranking zones', () => {
  it('ranks points descending and breaks ties by user id', () => {
    expect(
      rankLeagueMembers([
        { userId: 'b', points: 4 },
        { userId: 'c', points: 8 },
        { userId: 'a', points: 4 },
      ]).map((member) => member.userId),
    ).toEqual(['c', 'a', 'b']);
  });

  it('uses top 10 / middle 10 / bottom 10 for a full cohort', () => {
    const zones = splitLeagueZones(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(zones.promotion).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(zones.middle).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(zones.relegation).toEqual([21, 22, 23, 24, 25, 26, 27, 28, 29, 30]);
  });

  it('keeps promotion and relegation disjoint in a short cohort', () => {
    const zones = splitLeagueZones(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(zones.promotion).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(zones.middle).toEqual([]);
    expect(zones.relegation).toEqual([11, 12, 13, 14, 15]);
    expect(new Set([...zones.promotion, ...zones.relegation]).size).toBe(15);
  });
});

describe('deterministicCohortPlans', () => {
  it('separates tiers and chunks 65 peers into 30/30/5', () => {
    const profiles = [
      ...Array.from({ length: 65 }, (_, i) => ({ id: `silver-${i}`, leagueTier: 1 })),
      { id: 'gold-1', leagueTier: 2 },
    ];
    const plans = deterministicCohortPlans(profiles, '2026-07-13');

    expect(plans.map((plan) => [plan.tier, plan.userIds.length])).toEqual([
      [1, 30],
      [1, 30],
      [1, 5],
      [2, 1],
    ]);
    expect(plans.filter((plan) => plan.tier === 1).flatMap((plan) => plan.userIds)).toHaveLength(
      65,
    );
  });

  it('returns exactly the same order for the same user/week input', () => {
    const profiles = Array.from({ length: 40 }, (_, i) => ({ id: `user-${i}`, leagueTier: 0 }));
    const first = deterministicCohortPlans(profiles, '2026-07-13');
    const second = deterministicCohortPlans([...profiles].reverse(), '2026-07-13');
    expect(second).toEqual(first);
  });

  it('deduplicates users and rejects an invalid cohort size', () => {
    expect(
      deterministicCohortPlans(
        [
          { id: 'same', leagueTier: 1 },
          { id: 'same', leagueTier: 1 },
        ],
        '2026-07-13',
      )[0]?.userIds,
    ).toEqual(['same']);
    expect(() => deterministicCohortPlans([], '2026-07-13', 0)).toThrow(RangeError);
  });
});
