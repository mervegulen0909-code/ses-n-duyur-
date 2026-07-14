import { describe, expect, it } from 'vitest';

import {
  buildSongFeed,
  categoriesInFeed,
  MIN_COVERS_PER_SONG,
  type PerfFeedRow,
  type SongMetaRow,
} from './home-feed';

const songs: SongMetaRow[] = [
  { id: 's1', title: 'Rolling in the Deep', artist: 'Adele', category: 'pop' },
  { id: 's2', title: 'Bohemian Rhapsody', artist: 'Queen', category: 'rock' },
  { id: 's3', title: 'Lonely Song', artist: 'Nobody', category: 'ballad' },
];

function perf(
  id: string,
  songId: string | null,
  score: number | null,
  opts: { provisional?: boolean; thumb?: string } = {},
): PerfFeedRow {
  return {
    id,
    song_id: songId,
    oembed_meta: { thumbnailUrl: opts.thumb ?? `thumb-${id}` },
    scores: { current_score: score, is_provisional: opts.provisional ?? true },
  };
}

describe('buildSongFeed', () => {
  it('groups performances by song and counts covers', () => {
    const feed = buildSongFeed(songs, [
      perf('p1', 's1', 80),
      perf('p2', 's1', 90),
      perf('p3', 's2', 70),
    ]);
    const s1 = feed.find((e) => e.songId === 's1')!;
    expect(s1.coverCount).toBe(2);
    expect(feed.find((e) => e.songId === 's2')!.coverCount).toBe(1);
  });

  it('leading cover is the highest-scored one (thumbnail + score + link)', () => {
    const feed = buildSongFeed(songs, [
      perf('low', 's1', 60, { thumb: 'low.jpg' }),
      perf('high', 's1', 95, { thumb: 'high.jpg' }),
    ]);
    const s1 = feed.find((e) => e.songId === 's1')!;
    expect(s1.topScore).toBe(95);
    expect(s1.thumbnailUrl).toBe('high.jpg');
    expect(s1.bestPerformanceId).toBe('high');
  });

  it('ranks songs by top score, then cover count, then title', () => {
    const feed = buildSongFeed(songs, [
      perf('a', 's1', 88),
      perf('b', 's2', 88),
      perf('c', 's2', 50),
      perf('d', 's3', 91),
    ]);
    // s3 (91) first; then s1 vs s2 tie at 88 → s2 has more covers → s2 before s1
    expect(feed.map((e) => e.songId)).toEqual(['s3', 's2', 's1']);
  });

  it('flags songs below the minimum cover count', () => {
    const covers = Array.from({ length: MIN_COVERS_PER_SONG }, (_, i) =>
      perf(`full-${i}`, 's1', 70 + i),
    );
    const feed = buildSongFeed(songs, [...covers, perf('solo', 's2', 80)]);
    expect(feed.find((e) => e.songId === 's1')!.needsMoreCovers).toBe(false);
    expect(feed.find((e) => e.songId === 's2')!.needsMoreCovers).toBe(true);
  });

  it('skips performances without a matching song', () => {
    const feed = buildSongFeed(songs, [
      perf('orphan', null, 99),
      perf('ghost', 'does-not-exist', 99),
      perf('ok', 's1', 80),
    ]);
    expect(feed).toHaveLength(1);
    expect(feed[0]!.songId).toBe('s1');
  });

  it('sorts unscored songs last without crashing', () => {
    const feed = buildSongFeed(songs, [perf('none', 's2', null), perf('scored', 's1', 75)]);
    expect(feed.map((e) => e.songId)).toEqual(['s1', 's2']);
    expect(feed[1]!.topScore).toBeNull();
  });

  it('treats a non-provisional leading score as measured', () => {
    const feed = buildSongFeed(songs, [
      perf('measured', 's1', 90, { provisional: false }),
      perf('prov', 's1', 80, { provisional: true }),
    ]);
    expect(feed[0]!.topIsProvisional).toBe(false);
  });
});

describe('categoriesInFeed', () => {
  it('returns distinct categories in first-seen order', () => {
    const feed = buildSongFeed(songs, [
      perf('a', 's2', 90), // rock
      perf('b', 's1', 80), // pop
      perf('c', 's3', 70), // ballad
    ]);
    expect(categoriesInFeed(feed)).toEqual(['rock', 'pop', 'ballad']);
  });
});
