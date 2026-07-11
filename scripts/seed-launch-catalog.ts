/**
 * Seed the launch catalog from supabase/seed/launch-catalog.template.json.
 *
 * REFUSES to run while any `youtubeUrl` in the template is still null — the
 * template ships with placeholders (see docs/launch-growth-plan.md §4.6);
 * fill in real links before running this.
 *
 * Scores performances with the deterministic MockScoringProvider (no paid
 * API calls, no keys required) — every seeded row honestly records
 * `ai_provider: 'mock'`. Re-score through the normal app flow later if real
 * provider estimates are wanted for the launch catalog.
 *
 * Env (never hardcoded):
 *   SUPABASE_URL               — project URL
 *   SUPABASE_SERVICE_ROLE_KEY  — service role key (server-side only)
 *
 * Usage: pnpm seed:launch-catalog
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
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
import type { Database, Json } from '@voxscore/db';

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

function loadTemplate(): TemplateSong[] {
  return JSON.parse(readFileSync(TEMPLATE_PATH, 'utf8')) as TemplateSong[];
}

function assertReadyToSeed(songs: TemplateSong[]): void {
  const missing: string[] = [];
  for (const song of songs) {
    if (!SONG_CATEGORIES.includes(song.category)) {
      throw new Error(`"${song.title}": invalid category "${song.category}"`);
    }
    if (!SONG_DIFFICULTIES.includes(song.difficulty)) {
      throw new Error(`"${song.title}": invalid difficulty "${song.difficulty}"`);
    }
    for (const [i, perf] of song.performances.entries()) {
      if (!perf.youtubeUrl) missing.push(`${song.title} — ${song.artist} (slot ${i + 1})`);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Refusing to seed: ${missing.length} performance slot(s) still have a null youtubeUrl:\n` +
        missing.map((m) => `  - ${m}`).join('\n') +
        `\n\nFill in real links in ${TEMPLATE_PATH} first.`,
    );
  }
}

async function main(): Promise<void> {
  const songs = loadTemplate();
  assertReadyToSeed(songs);

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.');
  }
  const service = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Seeded performances need a user_id (profiles.id, NOT NULL) — attribute
  // them to the first admin profile, the same convention as the curated
  // /api/performances path.
  const { data: admin, error: adminError } = await service
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle();
  if (adminError || !admin) {
    throw new Error('No admin profile found — create one before seeding the launch catalog.');
  }
  const seedUserId = admin.id;

  const scoring = createScoringProvider();
  let created = 0;
  let skippedDuplicates = 0;
  let failed = 0;

  for (const song of songs) {
    const key = normalizeSongKey(song.artist, song.title);
    if (!key) {
      console.error(`Skipping "${song.title}" — could not derive a normalized key`);
      failed += song.performances.length;
      continue;
    }

    const { data: existingSong } = await service
      .from('songs')
      .select('id')
      .eq('normalized_key', key)
      .maybeSingle();

    let songId = existingSong?.id;
    if (!songId) {
      const { data: createdSong, error: songError } = await service
        .from('songs')
        .insert({
          title: song.title,
          artist: song.artist,
          normalized_key: key,
          category: song.category,
          difficulty: song.difficulty,
        })
        .select('id')
        .single();
      if (songError || !createdSong) {
        console.error(`Could not create song "${song.title}":`, songError);
        failed += song.performances.length;
        continue;
      }
      songId = createdSong.id;
    }

    for (const perf of song.performances) {
      const videoId = parseYouTubeId(perf.youtubeUrl!);
      if (!videoId) {
        console.error(`"${song.title}": not a valid YouTube URL — ${perf.youtubeUrl}`);
        failed++;
        continue;
      }

      try {
        const oembed = await fetchOEmbed(videoId);
        const result = await scoring.score({
          videoId,
          title: oembed.title,
          authorName: oembed.authorName,
          hasVideo: true,
        });
        const payload = buildPerformanceCreate({
          userId: seedUserId,
          youtubeUrl: perf.youtubeUrl!,
          oembed,
          scoring: result,
          songId,
        });

        const { data: insertedPerf, error: perfError } = await service
          .from('performances')
          .insert({
            ...payload.performance,
            oembed_meta: payload.performance.oembed_meta as unknown as Json,
          })
          .select('id')
          .single();

        if (perfError || !insertedPerf) {
          if (perfError?.code === '23505') {
            console.log(`Already in the league, skipping: ${song.title} (${videoId})`);
            skippedDuplicates++;
            continue;
          }
          console.error(`Could not create performance for "${song.title}":`, perfError);
          failed++;
          continue;
        }

        const { error: scoreError } = await service.from('scores').insert({
          performance_id: insertedPerf.id,
          ...payload.score,
          ai_breakdown: payload.score.ai_breakdown as unknown as Json,
        });
        if (scoreError) {
          console.error(
            `Score insert failed for "${song.title}" (${insertedPerf.id}); rolling back:`,
            scoreError,
          );
          await service.from('performances').delete().eq('id', insertedPerf.id);
          failed++;
          continue;
        }

        created++;
        console.log(`Seeded: ${song.title} — ${oembed.authorName} (${insertedPerf.id})`);
      } catch (err) {
        console.error(`"${song.title}" (${videoId}) failed:`, err);
        failed++;
      }
    }
  }

  console.log(
    `\nDone. Created ${created}, skipped ${skippedDuplicates} duplicate(s), ${failed} failed.`,
  );
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
