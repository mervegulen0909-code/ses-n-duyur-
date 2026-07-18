import { fetchEmbeddableVideoIds, reportUnplayableSchema } from '@voxscore/core';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/guard';

/**
 * A client reports that a performance's YouTube video would not embed/play in
 * app (so an in-app Verified Listen — required to vote — is impossible for it).
 *
 * ANTI-GRIEF: a single report must never be able to exclude a rival's genuinely
 * embeddable video from battles. So we do NOT trust the client: we re-verify the
 * video's `status.embeddable` via the YouTube Data API and only stamp
 * `embed_unplayable_at` (service role — the column guard forbids user writes)
 * when YouTube itself confirms it is not embeddable. If we cannot verify (no key
 * or API error) we leave it alone. /api/battles/next then skips flagged rows.
 */
export async function POST(req: Request): Promise<Response> {
  const ctx = await getRequestContext(req);
  if (!ctx) return Response.json({ error: 'Authentication required' }, { status: 401 });

  let json: unknown = {};
  try {
    const text = await req.text();
    json = text ? JSON.parse(text) : {};
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = reportUnplayableSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 422 });

  const limited = await rateLimit(req, ctx.user.id);
  if (limited) return limited;

  const service = createSupabaseServiceClient();
  if (!service) return Response.json({ error: 'Server not configured' }, { status: 503 });

  const { data: perf } = await service
    .from('performances')
    .select('id, youtube_video_id, embed_unplayable_at')
    .eq('id', parsed.data.performanceId)
    .maybeSingle();

  // Nothing to flag: unknown performance or one without a YouTube video.
  if (!perf?.youtube_video_id) {
    return Response.json({ ok: true, flagged: false }, { status: 200 });
  }
  // Already flagged — idempotent, skip the API round-trip.
  if (perf.embed_unplayable_at) {
    return Response.json({ ok: true, flagged: true }, { status: 200 });
  }

  const embeddable = await fetchEmbeddableVideoIds(
    [perf.youtube_video_id],
    process.env.YOUTUBE_API_KEY,
  );
  // null → unverifiable (no key / API error); has() → YouTube says it embeds.
  // Either way, trust the Data API over a single client and do not flag.
  if (embeddable === null || embeddable.has(perf.youtube_video_id)) {
    return Response.json({ ok: true, flagged: false }, { status: 200 });
  }

  const { error } = await service
    .from('performances')
    .update({ embed_unplayable_at: new Date().toISOString() })
    .eq('id', perf.id);
  if (error) return Response.json({ error: 'Could not update performance' }, { status: 500 });

  return Response.json({ ok: true, flagged: true }, { status: 200 });
}
