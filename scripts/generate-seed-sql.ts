/**
 * Generate a SQL file that seeds the launch catalog, as an alternative to
 * `pnpm seed:launch-catalog` when a SUPABASE_SERVICE_ROLE_KEY isn't available
 * locally. Uses the exact same core logic (buildPerformanceCreate,
 * MockScoringProvider, normalizeSongKey) as the real seed script — only the
 * write mechanism differs: this emits SQL for `supabase db query --file`
 * (which runs through the already-authenticated `supabase link`ed CLI
 * session) instead of writing via supabase-js + a service-role JWT.
 *
 * Usage: pnpm exec tsx scripts/generate-seed-sql.ts > tmp/seed.sql
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildPerformanceCreate,
  createScoringProvider,
  fetchOEmbed,
  normalizeSongKey,
  parseYouTubeId,
  SONG_CATEGORIES,
  SONG_DIFFICULTIES,
  type SongCategory,
  type SongDifficulty,
} from '@voxscore/core';

interface TemplatePerformance {
  youtubeUrl: string | null;
  note: string;
}
interface TemplateSong {
  title: string;
  artist: string;
  category: SongCategory;
  difficulty: SongDifficulty;
  performances: TemplatePerformance[];
}

const TEMPLATE_PATH = fileURLToPath(
  new URL('../supabase/seed/launch-catalog.template.json', import.meta.url),
);
const OUT_PATH = fileURLToPath(new URL('../tmp/seed.sql', import.meta.url));

function loadTemplate(): TemplateSong[] {
  return JSON.parse(readFileSync(TEMPLATE_PATH, 'utf8')) as TemplateSong[];
}

// Bounded concurrency for real oEmbed fetches (public, unauthenticated,
// metadata-only — never downloads media, same as the app's own add flow).
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  }
  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

async function main(): Promise<void> {
  const songs = loadTemplate();
  const scoring = createScoringProvider();

  interface Row {
    normalized_key: string;
    title: string;
    artist: string;
    category: SongCategory;
    difficulty: SongDifficulty;
    youtube_video_id: string;
    oembed_meta: unknown;
    initial_ai_score: number;
    ai_breakdown: unknown;
    is_provisional: boolean;
    ai_provider: string;
    ai_model: string;
    scoring_version: number;
  }

  const flatSlots: { song: TemplateSong; perf: TemplatePerformance }[] = [];
  for (const song of songs) {
    if (!SONG_CATEGORIES.includes(song.category) || !SONG_DIFFICULTIES.includes(song.difficulty)) {
      console.error(`Skipping invalid song "${song.title}"`);
      continue;
    }
    const key = normalizeSongKey(song.artist, song.title);
    if (!key) {
      console.error(`Skipping "${song.title}" — could not derive normalized key`);
      continue;
    }
    for (const perf of song.performances) {
      if (perf.youtubeUrl) flatSlots.push({ song, perf });
    }
  }

  console.error(`Fetching oEmbed + scoring for ${flatSlots.length} performance slots...`);

  const rows = await mapWithConcurrency(flatSlots, 15, async ({ song, perf }) => {
    const videoId = parseYouTubeId(perf.youtubeUrl!);
    if (!videoId) return null;
    try {
      const oembed = await fetchOEmbed(videoId);
      const result = await scoring.score({
        videoId,
        title: oembed.title,
        authorName: oembed.authorName,
        hasVideo: true,
      });
      const payload = buildPerformanceCreate({
        userId: '00000000-0000-0000-0000-000000000000', // placeholder — SQL overrides with the real admin id
        youtubeUrl: perf.youtubeUrl!,
        oembed,
        scoring: result,
        songId: null,
      });
      const key = normalizeSongKey(song.artist, song.title)!;
      const row: Row = {
        normalized_key: key,
        title: song.title,
        artist: song.artist,
        category: song.category,
        difficulty: song.difficulty,
        youtube_video_id: payload.performance.youtube_video_id,
        oembed_meta: payload.performance.oembed_meta,
        initial_ai_score: payload.score.initial_ai_score,
        ai_breakdown: payload.score.ai_breakdown,
        is_provisional: payload.score.is_provisional,
        ai_provider: payload.score.ai_provider,
        ai_model: payload.score.ai_model,
        scoring_version: payload.score.scoring_version,
      };
      return row;
    } catch (err) {
      console.error(
        `Failed "${song.title}" (${videoId}):`,
        err instanceof Error ? err.message : err,
      );
      return null;
    }
  });

  const scoredRows = rows.filter((r): r is Row => r !== null);
  // Some independently-researched song entries turned out to share the same
  // real cover video (youtube_video_id) — dedupe here, since a duplicate would
  // otherwise fan out the SQL join between the performance insert and its
  // score insert (INSERT ... SELECT matching >1 input row per performance_id).
  const seenVideoIds = new Set<string>();
  const validRows: Row[] = [];
  let droppedDupes = 0;
  for (const row of scoredRows) {
    if (seenVideoIds.has(row.youtube_video_id)) {
      droppedDupes++;
      continue;
    }
    seenVideoIds.add(row.youtube_video_id);
    validRows.push(row);
  }
  console.error(
    `Scored ${scoredRows.length}/${flatSlots.length} performances; ${droppedDupes} duplicate video id(s) dropped; ${validRows.length} unique rows to seed.`,
  );

  const jsonPayload = JSON.stringify(validRows);
  const tag = 'seedjson';

  const sql = `
-- Auto-generated by scripts/generate-seed-sql.ts. Do not hand-edit.
-- Uses jsonb_to_recordset so no per-row SQL string escaping is needed —
-- only this one JSON blob (dollar-quoted) is embedded.
begin;

with input_data as (
  select *
  from jsonb_to_recordset($${tag}$${jsonPayload}$${tag}$::jsonb)
    as x(
      normalized_key text, title text, artist text, category text, difficulty text,
      youtube_video_id text, oembed_meta jsonb,
      initial_ai_score numeric, ai_breakdown jsonb, is_provisional boolean,
      ai_provider text, ai_model text, scoring_version int
    )
),
song_seed as (
  select distinct on (normalized_key) normalized_key, title, artist, category, difficulty
  from input_data
),
ins_songs as (
  insert into songs (title, artist, normalized_key, category, difficulty)
  select title, artist, normalized_key, category, difficulty
  from song_seed
  on conflict (normalized_key) where normalized_key is not null do nothing
  returning id, normalized_key
),
song_ids as (
  -- A sibling writable CTE's inserts are NOT visible to a plain table scan
  -- within the same statement snapshot — must union the CTE's own RETURNING
  -- (new rows) with a fresh scan for rows that already existed pre-statement
  -- (which conflicted and so produced no RETURNING row here).
  select id, normalized_key from ins_songs
  union
  select id, normalized_key from songs where normalized_key in (select normalized_key from song_seed)
),
seed_user as (
  select id from profiles where role = 'admin' order by id limit 1
),
open_season as (
  select id from seasons where ends_at is null order by starts_at desc limit 1
),
ins_perf as (
  insert into performances (user_id, song_id, source, youtube_video_id, oembed_meta, has_video)
  select (select id from seed_user), si.id, 'youtube', d.youtube_video_id, d.oembed_meta, true
  from input_data d
  join song_ids si on si.normalized_key = d.normalized_key
  on conflict (youtube_video_id) where youtube_video_id is not null do nothing
  returning id as performance_id, youtube_video_id
)
insert into scores (
  performance_id, scoring_version, initial_ai_score, ai_breakdown, is_provisional,
  ai_provider, ai_model, listener_score, current_score, trend_score, verified_vote_count, season_id
)
select
  ip.performance_id, d.scoring_version, d.initial_ai_score, d.ai_breakdown, d.is_provisional,
  d.ai_provider, d.ai_model, null, d.initial_ai_score, 0, 0, (select id from open_season)
from ins_perf ip
join input_data d on d.youtube_video_id = ip.youtube_video_id;

commit;

select
  (select count(*) from songs) as total_songs_now,
  (select count(*) from performances) as total_performances_now;
`;

  writeFileSync(OUT_PATH, sql, 'utf8');
  console.error(`Wrote ${OUT_PATH} (${validRows.length} rows).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exitCode = 1;
});
