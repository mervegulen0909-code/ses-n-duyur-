import { describe, expect, it } from 'vitest';
import { wilsonLowerBound } from './wilson';

describe('wilsonLowerBound', () => {
  it('is 0 with no observations', () => {
    expect(wilsonLowerBound(0, 0)).toBe(0);
  });

  it('penalizes small samples vs large ones at the same ratio', () => {
    const few = wilsonLowerBound(5, 5); // 100% of 5
    const many = wilsonLowerBound(480, 500); // 96% of 500
    expect(many).toBeGreaterThan(few);
  });

  it('returns a value within [0, 1]', () => {
    const bound = wilsonLowerBound(30, 50);
    expect(bound).toBeGreaterThan(0);
    expect(bound).toBeLessThan(1);
  });

  it('accepts a custom z-score', () => {
    const tighter = wilsonLowerBound(8, 10, 1.0);
    const wider = wilsonLowerBound(8, 10, 2.58);
    expect(tighter).toBeGreaterThan(wider);
  });

  it('throws on invalid inputs', () => {
    expect(() => wilsonLowerBound(-1, 10)).toThrow(RangeError);
    expect(() => wilsonLowerBound(11, 10)).toThrow(RangeError);
    expect(() => wilsonLowerBound(1, Number.NaN)).toThrow(TypeError);
  });
});
