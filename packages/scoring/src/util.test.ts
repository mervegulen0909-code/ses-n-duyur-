import { describe, expect, it } from 'vitest';
import { assertFinite, assertScore, clamp, round } from './util';

describe('clamp', () => {
  it('returns value within range unchanged', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
  it('clamps below min and above max', () => {
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(42, 0, 10)).toBe(10);
  });
  it('throws when min > max', () => {
    expect(() => clamp(5, 10, 0)).toThrow(RangeError);
  });
});

describe('round', () => {
  it('rounds to 2 decimals by default', () => {
    expect(round(1.005)).toBe(1.01);
    expect(round(2.345)).toBe(2.35);
  });
  it('honors a custom decimal count', () => {
    expect(round(3.14159, 3)).toBe(3.142);
    expect(round(7.7, 0)).toBe(8);
  });
});

describe('assertFinite', () => {
  it('returns the value when finite', () => {
    expect(assertFinite(3.5, 'x')).toBe(3.5);
  });
  it('throws on NaN / Infinity / non-number', () => {
    expect(() => assertFinite(Number.NaN, 'x')).toThrow(TypeError);
    expect(() => assertFinite(Number.POSITIVE_INFINITY, 'x')).toThrow(/x/);
    // @ts-expect-error testing runtime guard against bad input
    expect(() => assertFinite('5', 'x')).toThrow(TypeError);
  });
});

describe('assertScore', () => {
  it('accepts values within [0, 100]', () => {
    expect(assertScore(0, 's')).toBe(0);
    expect(assertScore(100, 's')).toBe(100);
  });
  it('rejects out-of-range and non-finite values', () => {
    expect(() => assertScore(-1, 's')).toThrow(RangeError);
    expect(() => assertScore(101, 's')).toThrow(RangeError);
    expect(() => assertScore(Number.NaN, 's')).toThrow(TypeError);
  });
});
