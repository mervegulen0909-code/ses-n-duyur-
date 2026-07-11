import { CRITERIA, type Criterion } from '@voxscore/scoring';
import { describe, expect, it } from 'vitest';
import { criteriaOverall, recomputeScore } from './score-update';

describe('criteriaOverall — criterion-weighted (regime v4)', () => {
  it('weights criteria like the AI side (vocalAccuracy 0.20 … stagePresence 0.05)', () => {
    // all 9 present: 100 on vocalAccuracy, 0 elsewhere → exactly its weight share
    const only = Object.fromEntries(CRITERIA.map((c) => [c, 0])) as Record<Criterion, number>;
    only.vocalAccuracy = 100;
    expect(criteriaOverall(only)).toBe(20); // 0.20 / 1.00
  });

  it('renormalizes over the criteria actually provided (audio-only vote)', () => {
    const eight = Object.fromEntries(
      CRITERIA.filter((c) => c !== 'stagePresence').map((c) => [c, 0]),
    ) as Partial<Record<Criterion, number>>;
    eight.vocalAccuracy = 100;
    expect(criteriaOverall(eight)).toBeCloseTo((0.2 / 0.95) * 100, 2); // 21.05
  });

  it('weighted mean of a two-criterion partial: (80·0.20 + 60·0.12) / 0.32', () => {
    expect(criteriaOverall({ vocalAccuracy: 80, toneQuality: 60 })).toBe(72.5);
  });

  it('returns null when nothing is provided', () => {
    expect(criteriaOverall({})).toBeNull();
  });
});

describe('recomputeScore', () => {
  it('returns the AI score with no votes', () => {
    const r = recomputeScore({ initialAiScore: 80, voteOveralls: [] });
    expect(r.listenerScore).toBeNull();
    expect(r.currentScore).toBe(80);
    expect(r.trendScore).toBe(0);
    expect(r.verifiedVoteCount).toBe(0);
  });

  it('blends one vote by the smooth curve (lw = 1/61)', () => {
    const r = recomputeScore({ initialAiScore: 80, voteOveralls: [60] });
    expect(r.listenerScore).toBe(60);
    // 80 − (20 · 1/61) = 79.672…
    expect(r.currentScore).toBe(79.67);
    expect(r.trendScore).toBe(-0.33);
    expect(r.verifiedVoteCount).toBe(1);
  });

  it('averages multiple votes for the listener score', () => {
    const r = recomputeScore({ initialAiScore: 80, voteOveralls: [60, 90] });
    expect(r.listenerScore).toBe(75);
    expect(r.verifiedVoteCount).toBe(2);
  });

  it('keeps trend anchored to the original AI score after a measured basis change', () => {
    const r = recomputeScore({
      initialAiScore: 80,
      trendBaseline: 70,
      voteOveralls: [],
    });
    expect(r.currentScore).toBe(80);
    expect(r.trendScore).toBe(10);
  });
});
