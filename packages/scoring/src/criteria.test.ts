import { describe, expect, it } from 'vitest';
import {
  CRITERIA,
  DEFAULT_CRITERION_WEIGHTS,
  composeInitialAiScore,
  type CriteriaScores,
} from './criteria';

function scoresOf(value: number): CriteriaScores {
  return Object.fromEntries(CRITERIA.map((c) => [c, value])) as CriteriaScores;
}

describe('DEFAULT_CRITERION_WEIGHTS', () => {
  it('sums to 1.0', () => {
    const sum = CRITERIA.reduce((acc, c) => acc + DEFAULT_CRITERION_WEIGHTS[c], 0);
    expect(sum).toBeCloseTo(1, 10);
  });
});

describe('composeInitialAiScore', () => {
  it('returns the uniform value when all criteria are equal (with video)', () => {
    expect(composeInitialAiScore(scoresOf(100), { hasVideo: true })).toBe(100);
    expect(composeInitialAiScore(scoresOf(80), { hasVideo: true })).toBe(80);
  });

  it('rescales (renormalizes) when there is no video', () => {
    // With uniform scores the rescale must still yield the same uniform value.
    expect(composeInitialAiScore(scoresOf(80), { hasVideo: false })).toBe(80);
  });

  it('produces a different blend than the no-video case when stage differs', () => {
    const scores = scoresOf(90);
    scores.stagePresence = 0;
    const withVideo = composeInitialAiScore(scores, { hasVideo: true });
    const noVideo = composeInitialAiScore(scores, { hasVideo: false });
    // No-video drops the 0 stage score, so it should rank higher.
    expect(noVideo).toBeGreaterThan(withVideo);
    expect(noVideo).toBe(90);
  });

  it('computes a weighted blend for mixed scores', () => {
    const scores = scoresOf(50);
    scores.vocalAccuracy = 100; // weight 0.20
    // expected = 0.20*100 + 0.80*50 = 60
    expect(composeInitialAiScore(scores, { hasVideo: true })).toBe(60);
  });

  it('accepts custom weights', () => {
    const weights = { ...DEFAULT_CRITERION_WEIGHTS, vocalAccuracy: 0.2 };
    expect(composeInitialAiScore(scoresOf(70), { hasVideo: true, weights })).toBe(70);
  });

  it('throws on out-of-range criterion scores', () => {
    const bad = scoresOf(50);
    bad.toneQuality = 150;
    expect(() => composeInitialAiScore(bad, { hasVideo: true })).toThrow(RangeError);
  });

  it('throws on negative weights', () => {
    const weights = { ...DEFAULT_CRITERION_WEIGHTS, originality: -0.1 };
    expect(() => composeInitialAiScore(scoresOf(50), { hasVideo: true, weights })).toThrow(
      /originality/,
    );
  });

  it('throws when active weights sum to zero', () => {
    const zero = Object.fromEntries(CRITERIA.map((c) => [c, 0])) as Record<
      (typeof CRITERIA)[number],
      number
    >;
    expect(() => composeInitialAiScore(scoresOf(50), { hasVideo: true, weights: zero })).toThrow(
      /sum to > 0/,
    );
  });
});
