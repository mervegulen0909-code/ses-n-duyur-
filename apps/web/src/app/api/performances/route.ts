import { addPerformanceSchema } from '@voxscore/core';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { getProfileForContext } from '@/lib/auth';
import { botGuard, rateLimit } from '@/lib/guard';
import {
  createScoredPerformance,
  DuplicateVideoError,
  OEmbedFetchError,
} from '@/lib/performance-create';

/**
 * Curated/seed path only. Normal users submit `POST /api/performance-requests`
 * instead — this endpoint creates a performance (and its score) directly, so
 * it is restricted to admins.
 */
export async function POST(req: Request): Promise<Response> {
  let rawBody: string;
  let json: unknown;
  try {
    rawBody = await req.text();
    json = JSON.parse(rawBody);
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
  if ((await getProfileForContext(ctx))?.role !== 'admin') {
    return Response.json({ error: 'Submissions go through the request queue' }, { status: 403 });
  }
  const { user } = ctx;

  const limited = await rateLimit(req, user.id);
  if (limited) return limited;
  const bot = await botGuard(req, user.id, rawBody);
  if (bot) return bot;

  // Scores are written with the service role (RLS blocks user writes), and
  // performances has no DELETE policy — so a rollback is impossible without it.
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

  try {
    const perf = await createScoredPerformance(service, {
      userId: user.id,
      youtubeUrl: parsed.data.youtubeUrl,
      songId: parsed.data.songId,
    });
    return Response.json({ id: perf.id }, { status: 201 });
  } catch (err) {
    if (err instanceof DuplicateVideoError) {
      return Response.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof OEmbedFetchError) {
      return Response.json({ error: err.message }, { status: 502 });
    }
    console.error('[performances] createScoredPerformance failed:', err);
    return Response.json({ error: 'Could not create performance' }, { status: 500 });
  }
}
