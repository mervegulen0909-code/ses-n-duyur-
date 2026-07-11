import { describe, expect, it } from 'vitest';
import { reputationFromMad, weightFromReputation } from './reputation';

describe('weightFromReputation — profiles.reputation (int) → vote weight', () => {
  it('treats the default 0 as full weight 1.0 (no history yet)', () => {
    expect(weightFromReputation(0)).toBe(1);
  });
  it('maps stored thousandths to the clamped weight range [0.5, 1.5]', () => {
    expect(weightFromReputation(500)).toBe(0.5);
    expect(weightFromReputation(1000)).toBe(1);
    expect(weightFromReputation(1500)).toBe(1.5);
    expect(weightFromReputation(2000)).toBe(1.5); // clamped
    expect(weightFromReputation(100)).toBe(0.5); // clamped low
  });
});

describe('reputationFromMad — consensus agreement → stored reputation', () => {
  it('perfect agreement (mad 0) earns the max weight', () => {
    expect(reputationFromMad(0)).toBe(1500);
  });
  it('a 12.5-point mean deviation is neutral (weight 1.0)', () => {
    expect(reputationFromMad(12.5)).toBe(1000);
  });
  it('large deviations clamp at the minimum weight', () => {
    expect(reputationFromMad(25)).toBe(500);
    expect(reputationFromMad(60)).toBe(500);
  });
});
