import { describe, expect, it } from 'vitest';
import { currentScore, listenerScore, trendScore } from './score';

describe('listenerScore', () => {
  it('returns null with no votes', () => {
    expect(listenerScore([])).toBeNull();
  });

  it('computes an unweighted mean by default', () => {
    expect(listenerScore([{ overall: 80 }, { overall: 100 }])).toBe(90);
  });

  it('honors per-vote weights', () => {
    // (90*3 + 50*1) / 4 = 80
    expect(
      listenerScore([
        { overall: 90, weight: 3 },
        { overall: 50, weight: 1 },
      ]),
    ).toBe(80);
  });

  it('returns null when all weights are zero', () => {
    expect(listenerScore([{ overall: 90, weight: 0 }])).toBeNull();
  });

  it('throws on invalid overall or negative weight', () => {
    expect(() => listenerScore([{ overall: 120 }])).toThrow(RangeError);
    expect(() => listenerScore([{ overall: 50, weight: -1 }])).toThrow(/weight/);
  });
});

describe('currentScore', () => {
  it('equals the AI score with 0 verified votes', () => {
    expect(currentScore({ initialAiScore: 72, listenerScore: 95, verifiedVotes: 0 })).toBe(72);
  });

  it('equals the AI score when listener data is missing', () => {
    expect(currentScore({ initialAiScore: 72, listenerScore: null, verifiedVotes: 10 })).toBe(72);
  });

  it('blends AI and listener by the smooth curve (regime v4)', () => {
    // 10 votes → lw = 10/70 = 0.142857… → 0.857143*80 + 0.142857*60 ≈ 77.14
    expect(currentScore({ initialAiScore: 80, listenerScore: 60, verifiedVotes: 10 })).toBe(77.14);
  });

  it('shifts toward the crowd as votes grow, capped at the relaxed lw = 0.75', () => {
    // 200 votes → cap still 0.55 → 0.45*80 + 0.55*60 = 69
    expect(currentScore({ initialAiScore: 80, listenerScore: 60, verifiedVotes: 200 })).toBe(69);
    // 3000 votes → cap fully relaxed to 0.75 → 0.25*80 + 0.75*60 = 65
    expect(currentScore({ initialAiScore: 80, listenerScore: 60, verifiedVotes: 3000 })).toBe(65);
  });

  it('clamps the blend into [0, 100]', () => {
    expect(currentScore({ initialAiScore: 100, listenerScore: 100, verifiedVotes: 3000 })).toBe(
      100,
    );
  });

  it('throws on out-of-range inputs', () => {
    expect(() =>
      currentScore({ initialAiScore: 150, listenerScore: 50, verifiedVotes: 5 }),
    ).toThrow(RangeError);
    expect(() =>
      currentScore({ initialAiScore: 80, listenerScore: 150, verifiedVotes: 5 }),
    ).toThrow(RangeError);
  });
});

describe('trendScore', () => {
  it('is current minus initial', () => {
    expect(trendScore(77, 80)).toBe(-3);
    expect(trendScore(85, 80)).toBe(5);
  });
  it('validates its inputs', () => {
    expect(() => trendScore(120, 80)).toThrow(RangeError);
  });
});
