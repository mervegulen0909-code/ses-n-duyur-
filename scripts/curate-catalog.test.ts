import { describe, expect, it } from 'vitest';
import {
  parseViewCountFromWatchHtml,
  sortByViewsDesc,
  validateCatalog,
  type CatalogPerformance,
  type CatalogSong,
} from './curate-catalog';

function perf(overrides: Partial<CatalogPerformance>): CatalogPerformance {
  return { youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ', note: 'n', ...overrides };
}

describe('sortByViewsDesc — most-viewed cover is ALWAYS the primary (index 0)', () => {
  it('puts the highest view count first', () => {
    const sorted = sortByViewsDesc([
      perf({ viewCount: 1_000 }),
      perf({ viewCount: 5_000_000 }),
      perf({ viewCount: 20_000 }),
    ]);
    expect(sorted.map((p) => p.viewCount)).toEqual([5_000_000, 20_000, 1_000]);
  });

  it('sorts unknown counts after known ones, and empty slots last', () => {
    const sorted = sortByViewsDesc([
      perf({ youtubeUrl: null, viewCount: undefined }),
      perf({ viewCount: null }),
      perf({ viewCount: 7 }),
    ]);
    expect(sorted[0]?.viewCount).toBe(7);
    expect(sorted[1]?.viewCount).toBeNull();
    expect(sorted[2]?.youtubeUrl).toBeNull();
  });

  it('does not mutate the input array', () => {
    const input = [perf({ viewCount: 1 }), perf({ viewCount: 2 })];
    sortByViewsDesc(input);
    expect(input.map((p) => p.viewCount)).toEqual([1, 2]);
  });
});

describe('parseViewCountFromWatchHtml', () => {
  it('extracts videoDetails.viewCount from embedded player JSON', () => {
    const html = '..."videoDetails":{"videoId":"abc","viewCount":"12345678","author":"X"}...';
    expect(parseViewCountFromWatchHtml(html)).toBe(12_345_678);
  });

  it('tolerates whitespace around the colon', () => {
    expect(parseViewCountFromWatchHtml('"viewCount" : "42"')).toBe(42);
  });

  it('returns null when the page exposes no count (consent wall etc.)', () => {
    expect(parseViewCountFromWatchHtml('<html>consent required</html>')).toBeNull();
  });

  it('never treats a missing count as zero', () => {
    expect(parseViewCountFromWatchHtml('"viewCount":""')).toBeNull();
  });
});

describe('validateCatalog', () => {
  const base: CatalogSong = {
    title: 'T',
    artist: 'A',
    category: 'pop',
    difficulty: 'easy',
    performances: [perf({})],
  };

  it('accepts a valid catalog (null slots allowed — not yet filled)', () => {
    expect(() =>
      validateCatalog([{ ...base, performances: [perf({}), perf({ youtubeUrl: null })] }]),
    ).not.toThrow();
  });

  it('rejects an invalid category', () => {
    expect(() =>
      validateCatalog([{ ...base, category: 'polka' as CatalogSong['category'] }]),
    ).toThrow(/invalid category/);
  });

  it('rejects a non-YouTube URL', () => {
    expect(() =>
      validateCatalog([{ ...base, performances: [perf({ youtubeUrl: 'https://vimeo.com/123' })] }]),
    ).toThrow(/not a valid YouTube URL/);
  });
});
