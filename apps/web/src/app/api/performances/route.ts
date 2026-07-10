import {
  addPerformanceSchema,
  buildPerformanceCreate,
  fetchOEmbed,
  normalizeSongKey,
  parseYouTubeId,
} from '@voxscore/core';
import type { Json } from '@voxscore/db';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { getScoringProvider } from '@/lib/adapters/scoring';
import { getSongExtractor } from '@/lib/adapters/song';
import { botGuard, rateLimit } from '@/lib/guard';

type ServiceClient = NonNullable<ReturnType<typeof createSupabaseServiceClient>>;

/**
 * Resolve which SONG this video performs and upsert it into public.songs,
 * keyed on normalized_key, so covers of the same song share a song_id (the
 * battle matcher pairs same-song performances first — the product's core
 * "who sings THIS song best" loop). Best-effort by design: any failure just
 * returns null and the performance is added without a song link.
 */
async function resolveSongId(
  service: ServiceClient,
  input: { title: string; authorName: string },
): Promise<string | null> {
  try {
    const guess = await getSongExtractor().extract(input);
    if (!guess) return null;
    const key = normalizeSongKey(guess.artist, guess.title);
    if (!key) return null;

    const { data: existing } = await service
      .from('songs')
      .select('id')
      .eq('normalized_key', key)
      .maybeSingle();
    if (existing) return existing.id;

    const { data: created, error } = await service
      .from('songs')
      .insert({ title: guess.title, artist: guess.artist, normalized_key: key })
      .select('id')
      .single();
    if (created) return created.id;

    // Unique-index race: another add created the song between our select and
    // insert — re-read the winner instead of dropping the link.
    if (error?.code === '23505') {
      const { data: winner } = await service
        .from('songs')
        .select('id')
        .eq('normalized_key', key)
        .maybeSingle();
      return winner?.id ?? null;
    }
    return null;
  } catch (err) {
    console.error('[performances] song resolution failed; adding without song link:', err);
    return null;
  }
}

export async function POST(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = addPerformanceSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid input: a valid YouTube URL is required' },
      { status: 422 },
    );
  }

  const ctx = await getRequestContext(req);
  if (!ctx) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }
  const { supabase, user } = ctx;

  const limited = await rateLimit(req, user.id);
  if (limited) return limited;
  const bot = await botGuard(req);
  if (bot) return bot;

  // Scores are written with the service role (RLS blocks user writes), and
  // performances has no DELETE policy — so a user-scoped rollback is impossible.
  // Acquire the service client up front, BEFORE the oEmbed fetch, the (paid) LLM
  // scoring call, and the performance insert: a missing/invalid service key then
  // fails fast and can never leave an orphan, scoreless (unrankable) performance.
  const service = createSupabaseServiceClient();
  if (!service) {
    console.error(
      '[performances] SUPABASE_SERVICE_ROLE_KEY missing/invalid — refusing to create a scoreless performance',
    );
    return Response.json(
      { error: 'Scoring is temporarily unavailable. Please try again later.' },
      { status: 503 },
    );
  }

  const videoId = parseYouTubeId(parsed.data.youtubeUrl);
  if (!videoId) {
    return Response.json({ error: 'Invalid YouTube URL' }, { status: 422 });
  }

  let oembed;
  try {
    oembed = await fetchOEmbed(videoId);
  } catch {
    return Response.json({ error: 'Could not fetch YouTube metadata' }, { status: 502 });
  }

  // Score and resolve the song concurrently — two independent LLM/API calls.
  const [scoring, resolvedSongId] = await Promise.all([
    getScoringProvider().score({
      videoId,
      title: oembed.title,
      authorName: oembed.authorName,
      hasVideo: true,
    }),
    parsed.data.songId
      ? Promise.resolve<string | null>(null) // caller pinned the song explicitly
      : resolveSongId(service, { title: oembed.title, authorName: oembed.authorName }),
  ]);

  const payload = buildPerformanceCreate({
    userId: user.id,
    youtubeUrl: parsed.data.youtubeUrl,
    oembed,
    scoring,
    songId: parsed.data.songId ?? resolvedSongId,
  });

  // Insert the performance AS THE USER (RLS enforces user_id = auth.uid()).
  const { data: perf, error: perfError } = await supabase
    .from('performances')
    .insert({
      ...payload.performance,
      oembed_meta: payload.performance.oembed_meta as unknown as Json,
    })
    .select('id')
    .single();

  if (perfError || !perf) {
    // Unique index performances_youtube_video_unique: one video = one league
    // entry (and therefore exactly one AI score). A duplicate submit is a
    // user-facing conflict, not a server error.
    if (perfError?.code === '23505') {
      return Response.json({ error: 'This video is already in the league' }, { status: 409 });
    }
    return Response.json({ error: 'Could not create performance' }, { status: 500 });
  }

  // Write the score row. If it fails, roll back the performance (service role
  // bypasses RLS) so we never persist a performance without its score, and
  // surface the failure instead of silently swallowing it.
  const { error: scoreError } = await service.from('scores').insert({
    performance_id: perf.id,
    ...payload.score,
    ai_breakdown: payload.score.ai_breakdown as unknown as Json,
  });
  if (scoreError) {
    console.error(`[performances] score insert failed for ${perf.id}; rolling back`, scoreError);
    // Roll back via the service role (performances has no user DELETE policy).
    const { error: rollbackError } = await service.from('performances').delete().eq('id', perf.id);
    if (rollbackError) {
      console.error(
        `[performances] ROLLBACK FAILED — orphaned scoreless performance ${perf.id}`,
        rollbackError,
      );
    }
    return Response.json({ error: 'Could not score performance' }, { status: 500 });
  }

  return Response.json({ id: perf.id }, { status: 201 });
}
