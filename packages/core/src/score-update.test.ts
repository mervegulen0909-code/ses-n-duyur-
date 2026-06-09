import { describe, expect, it } from 'vitest';
import { criteriaOverall, recomputeScore } from './score-update';

describe('criteriaOverall', () => {
  it('averages the provided criteria', () => {
    expect(criteriaOverall({ vocalAccuracy: 80, toneQuality: 60 })).toBe(70);
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

  it('blends one vote by the 1–25 tier (AI 0.85 / Listener 0.15)', () => {
    const r = recomputeScore({ initialAiScore: 80, voteOveralls: [60] });
    expect(r.listenerScore).toBe(60);
    expect(r.currentScore).toBe(77); // 0.85*80 + 0.15*60
    expect(r.trendScore).toBe(-3);
    expect(r.verifiedVoteCount).toBe(1);
  });

  it('averages multiple votes for the listener score', () => {
    const r = recomputeScore({ initialAiScore: 80, voteOveralls: [60, 90] });
    expect(r.listenerScore).toBe(75);
    expect(r.verifiedVoteCount).toBe(2);
  });
});
