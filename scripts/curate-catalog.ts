/**
 * Curate the launch/library catalog: verify every YouTube link and order each
 * song's performances by view count — THE MOST-VIEWED COVER IS ALWAYS THE
 * PRIMARY SCORING VIDEO (index 0). This is a standing curation rule, not a
 * one-off: the catalog is a living library (38 pilot → 1000+) and this script
 * is the repeatable update path.
 *
 * What it does per performance slot with a URL:
 *   1. oEmbed-verifies the video (exists + embeddable — metadata only, we
 *      NEVER download media; same legal footing as the app's add flow).
 *   2. Fetches the public view count:
 *        - YouTube Data API v3 (`videos.list?part=statistics`) when
 *          YOUTUBE_API_KEY is set — authoritative, batched 50 ids/request,
 *          the right path at 1000+ scale.
 *        - Otherwise falls back to reading the count out of the public watch
 *          page's embedded player JSON — best-effort dev-time metadata scrape
 *          (no media touched); can return null (e.g. consent walls).
 *   3. Sorts each song's performances by viewCount desc (nulls last) and
 *      writes the enriched template back (viewCount, oembedTitle, author,
 *      verifiedAt), so the seed order — and therefore the primary video — is
 *      always the most-viewed cover.
 *
 * Dead links are reported (and their stale enrichment cleared) so periodic
 * re-runs double as library health checks.
 *
 * Usage:
 *   pnpm curate:catalog            # verify + enrich + sort + write back
 *   pnpm curate:catalog --check    # verify + report only, no file writes
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  fetchOEmbed,
  parseYouTubeId,
  SONG_CATEGORIES,
  SONG_DIFFICULTIES,
  type SongCategory,
  type SongDifficulty,
} from '@voxscore/core';

export interface CatalogPerformance {
  youtubeUrl: string | null;
  note: string;
  /** Enriched by this script — public view count at verifiedAt time. */
  viewCount?: number | null;
  oembedTitle?: string;
  author?: string;
  verifiedAt?: string;
}
export interface CatalogSong {
  title: string;
  artist: string;
  category: SongCategory;
  difficulty: SongDifficulty;
  performances: CatalogPerformance[];
}

const TEMPLATE_PATH = fileURLToPath(
  new URL('../supabase/seed/launch-catalog.template.json', import.meta.url),
);

export function validateCatalog(songs: CatalogSong[]): void {
  for (const song of songs) {
    if (!SONG_CATEGORIES.includes(song.category)) {
      throw new Error(`"${song.title}": invalid category "${song.category}"`);
    }
    if (!SONG_DIFFICULTIES.includes(song.difficulty)) {
      throw new Error(`"${song.title}": invalid difficulty "${song.difficulty}"`);
    }
    for (const perf of song.performances) {
      if (perf.youtubeUrl !== null && parseYouTubeId(perf.youtubeUrl) === null) {
        throw new Error(`"${song.title}": not a valid YouTube URL — ${perf.youtubeUrl}`);
      }
    }
  }
}

/**
 * Order a song's performances so the most-viewed is FIRST (the primary
 * scoring video). Unknown counts sort after known ones; slots without a URL
 * sort last. Stable for equal keys, and does not mutate the input.
 */
export function sortByViewsDesc(perfs: readonly CatalogPerformance[]): CatalogPerformance[] {
  const rank = (p: CatalogPerformance): number => {
    if (!p.youtubeUrl) return -2; // empty slots last
    if (p.viewCount === null || p.viewCount === undefined) return -1; // unknown counts next-to-last
    return p.viewCount;
  };
  return [...perfs].sort((a, b) => rank(b) - rank(a));
}

/**
 * Pull videoDetails.viewCount out of a public watch page's embedded player
 * JSON. Returns null when the page doesn't expose it (consent wall, layout
 * change) — callers treat null as "unknown", never as zero.
 */
export function parseViewCountFromWatchHtml(html: string): number | null {
  const match = /"viewCount"\s*:\s*"(\d+)"/.exec(html);
  if (!match?.[1]) return null;
  const count = Number(match[1]);
  return Number.isSafeInteger(count) ? count : null;
}

/** Batch-fetch authoritative view counts via YouTube Data API v3 (50 ids/call). */
async function fetchViewCountsViaApi(
  videoIds: readonly string[],
  apiKey: string,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const url =
      'https://www.googleapis.com/youtube/v3/videos' +
      `?part=statistics&id=${batch.join(',')}&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`YouTube Data API error ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as {
      items?: { id: string; statistics?: { viewCount?: string } }[];
    };
    for (const item of json.items ?? []) {
      const count = Number(item.statistics?.viewCount);
      if (Number.isSafeInteger(count)) counts.set(item.id, count);
    }
  }
  return counts;
}

/** Best-effort fallback: read the count off the public watch page (metadata only). */
async function fetchViewCountViaWatchPage(videoId: string): Promise<number | null> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { 'accept-language': 'en' },
    });
    if (!res.ok) return null;
    return parseViewCountFromWatchHtml(await res.text());
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const checkOnly = process.argv.includes('--check');
  const songs = JSON.parse(readFileSync(TEMPLATE_PATH, 'utf8')) as CatalogSong[];
  validateCatalog(songs);

  const apiKey = process.env.YOUTUBE_API_KEY;
  const now = new Date().toISOString();
  const dead: string[] = [];
  const unknownCounts: string[] = [];
  const emptySlots: string[] = [];
  let verified = 0;

  // 1. oEmbed-verify every filled slot (drop enrichment on dead links).
  for (const song of songs) {
    for (const perf of song.performances) {
      if (!perf.youtubeUrl) {
        emptySlots.push(`${song.title} — ${song.artist}`);
        continue;
      }
      const videoId = parseYouTubeId(perf.youtubeUrl)!;
      try {
        const oembed = await fetchOEmbed(videoId);
        perf.oembedTitle = oembed.title;
        perf.author = oembed.authorName;
        perf.verifiedAt = now;
        verified++;
      } catch {
        dead.push(`${song.title}: ${perf.youtubeUrl}`);
        delete perf.oembedTitle;
        delete perf.author;
        delete perf.verifiedAt;
        perf.viewCount = null;
      }
    }
  }

  // 2. View counts — API when available (authoritative), page fallback otherwise.
  const liveIds = songs
    .flatMap((s) => s.performances)
    .filter((p) => p.youtubeUrl && p.verifiedAt === now)
    .map((p) => parseYouTubeId(p.youtubeUrl!)!);

  const apiCounts = apiKey ? await fetchViewCountsViaApi(liveIds, apiKey) : null;
  for (const song of songs) {
    for (const perf of song.performances) {
      if (!perf.youtubeUrl || perf.verifiedAt !== now) continue;
      const videoId = parseYouTubeId(perf.youtubeUrl)!;
      const count = apiCounts?.get(videoId) ?? (await fetchViewCountViaWatchPage(videoId));
      perf.viewCount = count;
      if (count === null) unknownCounts.push(`${song.title}: ${perf.youtubeUrl}`);
    }
    // 3. Most-viewed first — the primary scoring video is always index 0.
    song.performances = sortByViewsDesc(song.performances);
  }

  if (!checkOnly) {
    writeFileSync(TEMPLATE_PATH, JSON.stringify(songs, null, 2) + '\n', 'utf8');
  }

  console.log(`\nCatalog curation report (${checkOnly ? 'check only' : 'written back'})`);
  console.log(`  view-count source: ${apiKey ? 'YouTube Data API' : 'watch-page fallback'}`);
  console.log(`  verified (live + embeddable): ${verified}`);
  console.log(`  empty slots (no URL yet):     ${emptySlots.length}`);
  console.log(`  DEAD links:                   ${dead.length}`);
  for (const d of dead) console.log(`    - ${d}`);
  console.log(`  unknown view counts:          ${unknownCounts.length}`);
  for (const u of unknownCounts) console.log(`    - ${u}`);
  for (const song of songs) {
    const primary = song.performances[0];
    if (primary?.youtubeUrl && primary.verifiedAt === now) {
      const views = primary.viewCount === null ? '?' : primary.viewCount?.toLocaleString('en-US');
      console.log(`  PRIMARY ${song.title}: ${primary.author} (${views} views)`);
    }
  }
  if (dead.length > 0) process.exitCode = 1;
}

// Only run as a CLI (the pure helpers above are imported by tests).
const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
