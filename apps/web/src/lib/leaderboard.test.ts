import { describe, expect, it } from 'vitest';
import {
  compareByScore,
  rankByElo,
  rankByScore,
  trendDirection,
  winRate,
  type LeaderboardRow,
  type StandingsRow,
} from './leaderboard';

function row(p: Partial<LeaderboardRow>): LeaderboardRow {
  return {
    id: p.id ?? p.title ?? 'id',
    title: p.title ?? 'title',
    currentScore: p.currentScore ?? null,
    trendScore: p.trendScore ?? null,
    isProvisional: p.isProvisional ?? true,
    wins: p.wins ?? 0,
    battles: p.battles ?? 0,
    wilson: p.wilson ?? 0,
  };
}

const titles = (rows: LeaderboardRow[]) => rows.map((r) => r.title);

describe('rankByScore', () => {
  it('ranks the higher current score first', () => {
    const ranked = rankByScore([
      row({ title: 'low', currentScore: 70 }),
      row({ title: 'high', currentScore: 90 }),
    ]);
    expect(titles(ranked)).toEqual(['high', 'low']);
  });

  it('sorts performances with no score last', () => {
    const ranked = rankByScore([
      row({ title: 'unscored', currentScore: null }),
      row({ title: 'scored', currentScore: 10 }),
    ]);
    expect(titles(ranked)).toEqual(['scored', 'unscored']);
  });

  it('keeps a zero score ahead of an unscored performance', () => {
    const ranked = rankByScore([
      row({ title: 'unscored', currentScore: null }),
      row({ title: 'zero', currentScore: 0 }),
    ]);
    expect(titles(ranked)).toEqual(['zero', 'unscored']);
  });

  it('breaks a score tie by battle success (Wilson)', () => {
    const ranked = rankByScore([
      row({ title: 'weakBattler', currentScore: 80, wilson: 0.1 }),
      row({ title: 'strongBattler', currentScore: 80, wilson: 0.5 }),
    ]);
    expect(titles(ranked)).toEqual(['strongBattler', 'weakBattler']);
  });

  it('breaks a score + Wilson tie alphabetically by title', () => {
    const ranked = rankByScore([
      row({ title: 'beta', currentScore: 80, wilson: 0.2 }),
      row({ title: 'alpha', currentScore: 80, wilson: 0.2 }),
    ]);
    expect(titles(ranked)).toEqual(['alpha', 'beta']);
  });

  it('does not mutate the input array', () => {
    const input = [row({ title: 'a', currentScore: 1 }), row({ title: 'b', currentScore: 2 })];
    const snapshot = [...input];
    rankByScore(input);
    expect(input).toEqual(snapshot);
  });

  it('treats two fully-equal rows as equal', () => {
    const a = row({ title: 'same', currentScore: 50, wilson: 0.3 });
    expect(compareByScore(a, { ...a })).toBe(0);
  });
});

describe('trendDirection', () => {
  it('returns up for a positive trend', () => {
    expect(trendDirection(2.3)).toBe('up');
  });

  it('returns down for a negative trend', () => {
    expect(trendDirection(-1.1)).toBe('down');
  });

  it('treats null and ~zero as flat', () => {
    expect(trendDirection(null)).toBe('flat');
    expect(trendDirection(0)).toBe('flat');
    expect(trendDirection(0.04)).toBe('flat');
  });
});

describe('winRate', () => {
  it('computes an integer percentage', () => {
    expect(winRate(3, 4)).toBe(75);
  });

  it('rounds to the nearest percent', () => {
    expect(winRate(1, 3)).toBe(33);
  });

  it('returns 0 with no battles', () => {
    expect(winRate(0, 0)).toBe(0);
  });
});

describe('rankByElo', () => {
  function s(p: Partial<StandingsRow>): StandingsRow {
    return {
      id: p.id ?? p.title ?? 'id',
      title: p.title ?? 'title',
      elo: p.elo ?? 1500,
      wins: p.wins ?? 0,
      battles: p.battles ?? 0,
    };
  }

  it('ranks the higher Elo first', () => {
    const ranked = rankByElo([s({ title: 'low', elo: 1500 }), s({ title: 'high', elo: 1620 })]);
    expect(ranked.map((r) => r.title)).toEqual(['high', 'low']);
  });

  it('breaks an Elo tie by battles played', () => {
    const ranked = rankByElo([
      s({ title: 'fewer', elo: 1500, battles: 3 }),
      s({ title: 'more', elo: 1500, battles: 9 }),
    ]);
    expect(ranked.map((r) => r.title)).toEqual(['more', 'fewer']);
  });

  it('breaks an Elo + battles tie by title', () => {
    const ranked = rankByElo([
      s({ title: 'beta', elo: 1500, battles: 4 }),
      s({ title: 'alpha', elo: 1500, battles: 4 }),
    ]);
    expect(ranked.map((r) => r.title)).toEqual(['alpha', 'beta']);
  });

  it('does not mutate the input', () => {
    const input = [s({ title: 'a', elo: 1510 }), s({ title: 'b', elo: 1490 })];
    const snap = [...input];
    rankByElo(input);
    expect(input).toEqual(snap);
  });
});
