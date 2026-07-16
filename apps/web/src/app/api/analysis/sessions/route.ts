import { createHash } from 'node:crypto';
import { createAnalysisSessionSchema } from '@voxscore/core';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/guard';
import { newAnalysisNonce, signAnalysisUploadClaims } from '@/lib/analysis-signature';

export const runtime = 'nodejs';

const SESSION_TTL_SECONDS = 10 * 60;
const MAX_WAV_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = createAnalysisSessionSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 422 });
  if (parsed.data.mode !== 'song_reference') {
    return Response.json({ error: 'Technique test mode is not available yet' }, { status: 422 });
  }

  const ctx = await getRequestContext(req);
  if (!ctx) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const limited = await rateLimit(req, ctx.user.id);
  if (limited) return limited;

  const service = createSupabaseServiceClient();
  const analyzerUrl = process.env.ANALYZER_URL?.replace(/\/$/, '');
  if (!service || !analyzerUrl) {
    return Response.json({ error: 'AI analysis is temporarily unavailable' }, { status: 503 });
  }

  const { data: performance } = await ctx.supabase
    .from('performances')
    .select('id, user_id, song_id, status')
    .eq('id', parsed.data.performanceId)
    .maybeSingle();
  if (!performance || performance.status !== 'active') {
    return Response.json({ error: 'Performance not found' }, { status: 404 });
  }
  if (performance.user_id !== ctx.user.id) {
    return Response.json({ error: 'Only the performer can request AI analysis' }, { status: 403 });
  }
  if (!performance.song_id) {
    await service
      .from('scores')
      .update({ score_status: 'reference_required', score_source: 'none' })
      .eq('performance_id', performance.id);
    return Response.json({ error: 'This performance needs a song reference' }, { status: 409 });
  }

  const { data: reference } = await service
    .from('song_references')
    .select('id')
    .eq('song_id', performance.song_id)
    .eq('status', 'ready')
    .maybeSingle();
  if (!reference) {
    await service
      .from('scores')
      .update({ score_status: 'reference_required', score_source: 'none' })
      .eq('performance_id', performance.id);
    return Response.json(
      { error: 'A verified melody reference is not ready yet' },
      { status: 409 },
    );
  }

  // Abandoned sessions (client vanished before upload) would otherwise hold
  // analysis_sessions_one_active_idx forever and 409 every retry for this
  // performance; nothing else transitions them once expires_at passes.
  await service
    .from('analysis_sessions')
    .update({ status: 'expired' })
    .eq('performance_id', performance.id)
    .in('status', ['created', 'uploading', 'processing'])
    .lte('expires_at', new Date().toISOString());

  const expiresAtEpochSeconds = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const expiresAt = new Date(expiresAtEpochSeconds * 1000).toISOString();
  const nonce = newAnalysisNonce();
  const nonceHash = createHash('sha256').update(nonce).digest('hex');
  const { data: session, error } = await service
    .from('analysis_sessions')
    .insert({
      performance_id: performance.id,
      user_id: ctx.user.id,
      reference_id: reference.id,
      mode: 'song_reference',
      status: 'created',
      upload_nonce_hash: nonceHash,
      expires_at: expiresAt,
    })
    .select('id')
    .single();
  if (error || !session) {
    if (error?.code === '23505') {
      return Response.json({ error: 'An analysis is already in progress' }, { status: 409 });
    }
    console.error('[analysis/sessions] insert failed', error);
    return Response.json({ error: 'Could not create analysis session' }, { status: 500 });
  }

  const { error: scoreError } = await service
    .from('scores')
    .update({ score_status: 'analysis_pending', score_source: 'none' })
    .eq('performance_id', performance.id);
  if (scoreError) {
    await service.from('analysis_sessions').delete().eq('id', session.id);
    console.error('[analysis/sessions] score state update failed', scoreError);
    return Response.json({ error: 'Could not prepare score for analysis' }, { status: 500 });
  }

  try {
    const uploadToken = signAnalysisUploadClaims({
      version: 1,
      sessionId: session.id,
      userId: ctx.user.id,
      performanceId: performance.id,
      nonce,
      expiresAtEpochSeconds,
    });
    return Response.json(
      {
        sessionId: session.id,
        uploadUrl: `${analyzerUrl}/analyze`,
        uploadToken,
        expiresAt,
        maxBytes: MAX_WAV_BYTES,
      },
      { status: 201 },
    );
  } catch (signatureError) {
    await service
      .from('analysis_sessions')
      .update({ status: 'failed', error_code: 'server_configuration' })
      .eq('id', session.id);
    console.error('[analysis/sessions] token signing failed', signatureError);
    return Response.json({ error: 'AI analysis is temporarily unavailable' }, { status: 503 });
  }
}
