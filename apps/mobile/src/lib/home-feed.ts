/**
 * Home feed shaping — turns the flat `performances` rows into a SONG-centric
 * feed where each song aggregates its competing cover videos. Pure and fully
 * unit-tested; the screen only does I/O + rendering.
 *
 * Product rule: a song is a competition between covers. We surface how many
 * covers a song has and flag songs below MIN_COVERS so the catalog is nudged
 * toward "at least 3 videos per song".
 */

import { isRankedScoreStatus } from '@voxscore/core';

/** A song is only a real competition once it has at least this many covers. */
export const MIN_COVERS_PER_SONG = 3;

export type ScoreRel = {
  current_score: number | null;
  is_provisional?: boolean | null;
  score_status: string;
};

export type SongMetaRow = {
  id: string;
  title: string;
  artist: string | null;
  category: string | null;
};

export type PerfFeedRow = {
  id: string;
  song_id: string | null;
  oembed_meta: { title?: string; authorName?: string; thumbnailUrl?: string } | null;
  scores: ScoreRel | ScoreRel[] | null;
};

export type SongEntry = {
  songId: string;
  title: string;
  artist: string;
  category: string | null;
  /** How many active covers compete under this song. */
  coverCount: number;
  /** Highest current_score across the covers (null when none scored yet). */
  topScore: number | null;
  /** True when the leading cover's score is still a Provisional AI Estimate. */
  topIsProvisional: boolean;
  /** Thumbnail of the leading cover — the song card's hero image. */
  thumbnailUrl: string | null;
  /** The leading cover's performance id (deep-link target). */
  bestPerformanceId: string;
  /** coverCount < MIN_COVERS_PER_SONG — needs more covers to be competitive. */
  needsMoreCovers: boolean;
};

export function scoreRowOf(scores: ScoreRel | ScoreRel[] | null | undefined): ScoreRel | null {
  if (!scores) return null;
  return (Array.isArray(scores) ? scores[0] : scores) ?? null;
}

function rankedCurrentScore(scores: ScoreRel | ScoreRel[] | null | undefined): number | null {
  const row = scoreRowOf(scores);
  return isRankedScoreStatus(row?.score_status) ? (row?.current_score ?? null) : null;
}

/** null scores sort last; higher score first; stable on ties. */
function byScoreDesc(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
}

/**
 * Aggregate performances into ranked song entries. Performances without a
 * `song_id` (or whose song isn't in `songs`) are skipped — the home feed is
 * strictly song-centric; those videos still live on their own screens.
 */
export function buildSongFeed(songs: SongMetaRow[], performances: PerfFeedRow[]): SongEntry[] {
  const songById = new Map(songs.map((s) => [s.id, s]));
  const groups = new Map<string, PerfFeedRow[]>();

  for (const perf of performances) {
    if (!perf.song_id || !songById.has(perf.song_id)) continue;
    const bucket = groups.get(perf.song_id);
    if (bucket) bucket.push(perf);
    else groups.set(perf.song_id, [perf]);
  }

  const entries: SongEntry[] = [];
  for (const [songId, perfs] of groups) {
    const song = songById.get(songId)!;
    // Leading cover = highest score; deterministic tiebreak by performance id
    // so the hero image never flickers between equal-scored covers.
    const ranked = [...perfs].sort((a, b) => {
      const cmp = byScoreDesc(rankedCurrentScore(a.scores), rankedCurrentScore(b.scores));
      return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
    });
    const best = ranked[0]!;
    const bestScore = scoreRowOf(best.scores);

    entries.push({
      songId,
      title: song.title,
      artist: song.artist ?? '',
      category: song.category,
      coverCount: perfs.length,
      topScore: rankedCurrentScore(best.scores),
      // Provisional estimates rank but stay clearly labeled as such.
      topIsProvisional: bestScore?.score_status !== 'ai_verified',
      thumbnailUrl: best.oembed_meta?.thumbnailUrl ?? null,
      bestPerformanceId: best.id,
      needsMoreCovers: perfs.length < MIN_COVERS_PER_SONG,
    });
  }

  // Song ranking: highest top-score first, then the fuller competition, then
  // title for a stable order.
  entries.sort(
    (a, b) =>
      byScoreDesc(a.topScore, b.topScore) ||
      b.coverCount - a.coverCount ||
      a.title.localeCompare(b.title),
  );
  return entries;
}

/** Distinct category values present in the feed, in first-seen order. */
export function categoriesInFeed(entries: SongEntry[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of entries) {
    if (e.category && !seen.has(e.category)) {
      seen.add(e.category);
      out.push(e.category);
    }
  }
  return out;
}
