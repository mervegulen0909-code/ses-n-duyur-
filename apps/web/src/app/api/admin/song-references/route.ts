import { publishSongReferenceSchema } from '@voxscore/core';
import type { Json } from '@voxscore/db';
import { getProfileForContext } from '@/lib/auth';
import { rateLimit } from '@/lib/guard';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = publishSongReferenceSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid melody reference' }, { status: 422 });
  }

  const ctx = await getRequestContext(req);
  if (!ctx) return Response.json({ error: 'Authentication required' }, { status: 401 });
  if ((await getProfileForContext(ctx))?.role !== 'admin') {
    return Response.json({ error: 'Admin access required' }, { status: 403 });
  }
  const limited = await rateLimit(req, ctx.user.id);
  if (limited) return limited;

  const service = createSupabaseServiceClient();
  if (!service) return Response.json({ error: 'Database unavailable' }, { status: 503 });

  const input = parsed.data;
  const { data: referenceId, error } = await service.rpc('publish_song_reference', {
    p_song_id: input.songId,
    p_source_type: input.sourceType,
    p_notes: input.notes as unknown as Json,
    p_duration_ms: Math.round(input.durationSeconds * 1000),
    p_tonic_midi: input.tonicMidi ?? null,
    p_created_by: ctx.user.id,
  });
  if (error || !referenceId) {
    const status = error?.message.includes('song_not_found') ? 404 : 500;
    console.error('[admin/song-references] publish failed', { code: error?.code });
    return Response.json(
      { error: status === 404 ? 'Song not found' : 'Could not publish reference' },
      { status },
    );
  }

  return Response.json({ referenceId }, { status: 201 });
}
