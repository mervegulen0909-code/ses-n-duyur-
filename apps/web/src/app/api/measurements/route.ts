import { z } from 'zod';
import {
  fetchVideoDurationSeconds,
  measuredAdjustedInitial,
  measuredDisplayApplies,
  type MeasuredBreakdown,
} from '@voxscore/core';
import { MEASURED_CRITERIA, measureWav } from '@voxscore/dsp';
import type { Criterion } from '@voxscore/scoring';
import type { Json } from '@voxscore/db';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { botGuard, rateLimit } from '@/lib/guard';

/**
 * POST /api/measurements?performanceId=<uuid> — ADR 0003 "measure and delete".
 *
 * Body: raw 16-bit PCM WAV bytes of the performer's OWN recording (Hard
 * Rule 3). The bytes are analyzed in memory and NEVER written to disk,
 * storage, or logs — only the measured features and sub-scores persist
 * (measured_scores). YouTube media is never touched (Hard Rule 1).
 *
 * The cap is Vercel's ~4.5 MB request-body limit, minus headroom: at the
 * recommended 16 kHz mono this fits a ~2 minute measurement take.
 */
const MAX_WAV_BYTES = 4 * 1024 * 1024;

const querySchema = z.object({ performanceId: z.string().uuid() });

/** DSP version stamped on rows; bump when the measurement math changes.
 *  v2 (2026-07-12): spectral-centroid toneQuality joins the measured set. */
const DSP_VERSION = 2;

export async function POST(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    performanceId: url.searchParams.get('performanceId') ?? undefined,
  });
  if (!parsed.success) {
    return Response.json({ error: 'Invalid input: performanceId is required' }, { status: 422 });
  }

  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > MAX_WAV_BYTES) {
    return Response.json({ error: 'Recording too large (max 4 MB WAV)' }, { status: 413 });
  }

  const ctx = await getRequestContext(req);
  if (!ctx) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const { supabase, user } = ctx;

  const limited = await rateLimit(req, user.id);
  if (limited) return limited;
  const bot = await botGuard(req, user.id);
  if (bot) return bot;

  // measured_scores is service-role-only by design (no user write policies):
  // a client can never forge a "Measured" number. Fail fast before analysis.
  const service = createSupabaseServiceClient();
  if (!service) {
    return Response.json(
      { error: 'Measurement is temporarily unavailable. Please try again later.' },
      { status: 503 },
    );
  }

  // Only the performer may attach a measurement to their performance.
  const { data: perf } = await supabase
    .from('performances')
    .select('id, user_id, has_video, status, youtube_video_id')
    .eq('id', parsed.data.performanceId)
    .maybeSingle();
  if (!perf || perf.status !== 'active') {
    return Response.json({ error: 'Performance not found' }, { status: 404 });
  }
  if (perf.user_id !== user.id) {
    return Response.json(
      { error: 'Only the performer can submit a recording for measurement' },
      { status: 403 },
    );
  }

  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength === 0) {
    return Response.json({ error: 'Empty body: send WAV bytes' }, { status: 400 });
  }
  if (bytes.byteLength > MAX_WAV_BYTES) {
    return Response.json({ error: 'Recording too large (max 4 MB WAV)' }, { status: 413 });
  }

  // Analyze in memory. `bytes` is never persisted anywhere — this scope is the
  // recording's entire lifetime on our side (ADR 0003).
  let measurement;
  try {
    measurement = measureWav(bytes);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not analyze recording';
    return Response.json({ error: message }, { status: 422 });
  }

  // dsp sub-scores → criterion-keyed breakdown (the Hard Rule 6 split).
  const breakdown: MeasuredBreakdown = {};
  for (const [criterion, measure] of Object.entries(MEASURED_CRITERIA)) {
    breakdown[criterion as Criterion] = measurement.scores[measure];
  }

  // "Duration-matched" badge (T13): does the measured take run the same
  // length (±5%) as the linked YouTube video? Data API duration METADATA
  // only (Hard Rule 1); null = unknown (no key / lookup failed) — an
  // unknown must never be presented as either a match or a mismatch.
  let durationMatched: boolean | null = null;
  const videoSeconds = perf.youtube_video_id
    ? await fetchVideoDurationSeconds(perf.youtube_video_id, process.env.YOUTUBE_API_KEY)
    : null;
  if (videoSeconds !== null && videoSeconds > 0) {
    durationMatched =
      Math.abs(measurement.features.durationS - videoSeconds) / videoSeconds <= 0.05;
  }

  const { error: upsertError } = await service.from('measured_scores').upsert(
    {
      performance_id: perf.id,
      user_id: user.id,
      dsp_version: DSP_VERSION,
      features: measurement.features as unknown as Json,
      measured_breakdown: breakdown as Json,
      duration_matched: durationMatched,
    },
    { onConflict: 'performance_id' },
  );
  if (upsertError) {
    console.error(`[measurements] upsert failed for ${perf.id}`, upsertError);
    return Response.json({ error: 'Could not store measurement' }, { status: 500 });
  }

  // Re-blend the denormalized score: the measured criteria replace the LLM
  // estimate in the start-score basis; listener votes blend exactly as before.
  const { data: scoreRow } = await service
    .from('scores')
    .select('initial_ai_score, ai_breakdown')
    .eq('performance_id', perf.id)
    .maybeSingle();

  if (scoreRow) {
    // Fairness gate: the measured DSP breakdown only replaces the estimate in
    // the score basis when it plausibly corresponds to THIS performance —
    // always for an owned upload (the WAV is the performance), but for a
    // YouTube embed only when the take length matches the video (±5%). This
    // stops an unrelated WAV from inflating a YouTube entry's objective
    // criteria; the measurement + badge are still stored either way. Every UI
    // uses this SAME rule (measuredDisplayApplies) to decide whether a
    // criterion may be labeled "Measured" — so the badge is never shown for a
    // value that didn't actually count.
    const measuredApplies = measuredDisplayApplies(!!perf.youtube_video_id, durationMatched);
    const measuredBasis = measuredApplies
      ? measuredAdjustedInitial({
          aiBreakdown: scoreRow.ai_breakdown as Partial<Record<Criterion, number>> | null,
          measured: breakdown,
          hasVideo: perf.has_video,
        })
      : null;
    const basis = measuredBasis ?? scoreRow.initial_ai_score ?? 0;

    const trendBaseline = scoreRow.initial_ai_score ?? basis;
    const { error: recomputeError } = await service.rpc('recompute_performance_score', {
      p_performance_id: perf.id,
      p_initial_ai_score: basis,
      p_trend_baseline: trendBaseline,
    });
    if (recomputeError) {
      console.error(`[measurements] score recompute failed for ${perf.id}`, recomputeError);
      return Response.json({ error: 'Could not recompute score' }, { status: 500 });
    }
  }

  return Response.json(
    { ok: true, audioStored: false, breakdown, features: measurement.features, durationMatched },
    { status: 201 },
  );
}
