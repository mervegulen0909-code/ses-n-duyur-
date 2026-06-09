import { describe, expect, it } from 'vitest';
import { applyBattle, expectedScore, updateRating } from './elo';

describe('expectedScore', () => {
  it('is 0.5 for equal ratings', () => {
    expect(expectedScore(1500, 1500)).toBeCloseTo(0.5, 10);
  });
  it('favors the higher-rated player', () => {
    expect(expectedScore(1700, 1500)).toBeGreaterThan(0.5);
    expect(expectedScore(1300, 1500)).toBeLessThan(0.5);
  });
  it('throws on non-finite ratings', () => {
    expect(() => expectedScore(Number.NaN, 1500)).toThrow(TypeError);
    expect(() => expectedScore(1500, Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });
});

describe('updateRating', () => {
  it('raises rating on an upset win and lowers on a loss', () => {
    const win = updateRating(1500, 1500, 1);
    const loss = updateRating(1500, 1500, 0);
    expect(win).toBeCloseTo(1516, 6); // +K/2
    expect(loss).toBeCloseTo(1484, 6); // -K/2
  });
  it('leaves an even draw unchanged', () => {
    expect(updateRating(1500, 1500, 0.5)).toBeCloseTo(1500, 6);
  });
  it('respects a custom K', () => {
    expect(updateRating(1500, 1500, 1, 16)).toBeCloseTo(1508, 6);
  });
  it('throws on non-positive K', () => {
    expect(() => updateRating(1500, 1500, 1, 0)).toThrow(RangeError);
    expect(() => updateRating(1500, 1500, 1, -10)).toThrow(RangeError);
  });
});

describe('applyBattle', () => {
  it('is zero-sum for equal ratings', () => {
    const { ratingA, ratingB } = applyBattle(1500, 1500, 1);
    expect(ratingA + ratingB).toBeCloseTo(3000, 6);
    expect(ratingA).toBeGreaterThan(ratingB);
  });
  it('handles a B win (resultForA = 0)', () => {
    const { ratingA, ratingB } = applyBattle(1500, 1500, 0);
    expect(ratingB).toBeGreaterThan(ratingA);
  });
  it('handles a draw', () => {
    const { ratingA, ratingB } = applyBattle(1600, 1400, 0.5);
    // Higher-rated A loses points on a draw; B gains.
    expect(ratingA).toBeLessThan(1600);
    expect(ratingB).toBeGreaterThan(1400);
  });
});
