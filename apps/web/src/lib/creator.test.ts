import { describe, expect, it } from 'vitest';
import { summarizeCreator, type CreatorPerf, type CreatorScore } from './creator';

const perf = (over: Partial<CreatorPerf> & { id: string }): CreatorPerf => ({
  oembed_meta: { title: `Title ${over.id}` },
  battle_wins: 0,
  battle_count: 0,
  ...over,
});

describe('summarizeCreator', () => {
  it('returns an empty, null-winRate summary for a creator with no performances', () => {
    const s = summarizeCreator([], []);
    expect(s).toEqual({
      totalPerformances: 0,
      wins: 0,
      losses: 0,
      battles: 0,
      winRate: null,
      rows: [],
    });
  });

  it('sums wins/losses/battles across performances and computes win rate', () => {
    const perfs = [
      perf({ id: 'a', battle_wins: 3, battle_count: 5 }),
      perf({ id: 'b', battle_wins: 1, battle_count: 5 }),
    ];
    const s = summarizeCreator(perfs, []);
    expect(s.totalPerformances).toBe(2);
    expect(s.wins).toBe(4);
    expect(s.battles).toBe(10);
    expect(s.losses).toBe(6);
    expect(s.winRate).toBeCloseTo(0.4);
  });

  it('joins scores by performance id and titles from oembed_meta', () => {
    const perfs = [perf({ id: 'a' })];
    const scores: CreatorScore[] = [
      { performance_id: 'a', current_score: 82.5, is_provisional: false },
    ];
    const s = summarizeCreator(perfs, scores);
    expect(s.rows[0]).toMatchObject({
      id: 'a',
      title: 'Title a',
      currentScore: 82.5,
      isProvisional: false,
    });
  });

  it('treats a missing score as provisional with a null current score', () => {
    const s = summarizeCreator([perf({ id: 'a' })], []);
    expect(s.rows).toEqual([
      expect.objectContaining({ id: 'a', currentScore: null, isProvisional: true }),
    ]);
  });

  it('falls back to a default title when oembed_meta has none', () => {
    const s = summarizeCreator([{ id: 'a', oembed_meta: {}, battle_wins: 0, battle_count: 0 }], []);
    expect(s.rows).toEqual([expect.objectContaining({ title: 'Untitled performance' })]);
  });

  it('sorts rows by current score descending, nulls last', () => {
    const perfs = [perf({ id: 'low' }), perf({ id: 'high' }), perf({ id: 'none' })];
    const scores: CreatorScore[] = [
      { performance_id: 'low', current_score: 40, is_provisional: true },
      { performance_id: 'high', current_score: 90, is_provisional: false },
    ];
    const s = summarizeCreator(perfs, scores);
    expect(s.rows.map((r) => r.id)).toEqual(['high', 'low', 'none']);
  });
});
