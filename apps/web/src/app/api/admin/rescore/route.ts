import type { Criterion } from '@voxscore/scoring';
import {
  fetchCaptionText,
  measuredAdjustedInitial,
  rescoreSchema,
  SCORING_VERSION,
  type MeasuredBreakdown,
} from '@voxscore/core';
import type { Json } from '@voxscore/db';
import { getScoringProvider } from '@/lib/adapters/scoring';
import { getProfileForContext } from '@/lib/auth';
import { applyOffsets, loadCalibration } from '@/lib/calibration';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';

/** LLM latency is seconds/row — keep batches small and let callers loop. */
export const maxDuration = 60;

interface OEmbedish {
  title?: string;
  authorName?: string;
}

/**
 * Admin: re-score performances whose current estimate came from the MOCK
 * provider (deterministic metadata-hash noise — e.g. the seed script can only
 * ever produce mock scores, because the real env-gated providers live in this
 * app, not in @voxscore/core). Runs the REAL provider against the same
 * metadata and recomputes the blended score via the existing RPC, so any
 * verified votes keep their weight.
 *
 * Honesty contract: if the real provider is not configured (or degrades to
 * mock mid-run), NOTHING is overwritten — a mock estimate is never dressed up
 * as a fresh one.
 */
export async function POST(req: Request): Promise<Response> {
  let json: unknown = {};
  try {
    const text = await req.text();
    if (text) json = JSON.parse(text);
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = rescoreSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 422 });

  const ctx = await getRequestContext(req);
  if (!ctx) return Response.json({ error: 'Forbidden' }, { status: 403 });
  if ((await getProfileForContext(ctx))?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = createSupabaseServiceClient();
  if (!service) return Response.json({ error: 'Server not configured' }, { status: 503 });

  const { data: mockScores, error: loadError } = await service
    .from('scores')
    // Queue: mock rows (hash noise) OR anything scored under an older regime —
    // bumping SCORING_VERSION re-queues the whole league for one rescore pass.
    .select('performance_id')
    .or(`ai_provider.eq.mock,scoring_version.lt.${SCORING_VERSION}`)
    .limit(parsed.data.limit);
  if (loadError) return Response.json({ error: 'Could not load scores' }, { status: 500 });

  const { count: totalMock } = await service
    .from('scores')
    .select('performance_id', { count: 'exact', head: true })
    .or(`ai_provider.eq.mock,scoring_version.lt.${SCORING_VERSION}`);

  if (!mockScores || mockScores.length === 0) {
    return Response.json({ rescored: 0, failed: 0, remaining: 0 });
  }

  const provider = getScoringProvider();
  const calibration = await loadCalibration(service);
  let rescored = 0;
  let failed = 0;
  let providerName = '';
  let modelName = '';

  for (const row of mockScores) {
    const { data: perf } = await service
      .from('performances')
      .select('id, youtube_video_id, oembed_meta, has_video')
      .eq('id', row.performance_id)
      .maybeSingle();
    if (!perf?.youtube_video_id) {
      failed++;
      continue;
    }
    const meta = (perf.oembed_meta ?? {}) as OEmbedish;

    const transcript = await fetchCaptionText(perf.youtube_video_id);
    const rawResult = await provider.score({
      videoId: perf.youtube_video_id,
      title: meta.title ?? '',
      authorName: meta.authorName ?? '',
      hasVideo: perf.has_video,
      transcript: transcript ?? undefined,
    });
    if (rawResult.provider === 'mock') {
      // Real provider missing or degraded — stop without writing anything.
      return Response.json(
        {
          error: 'Real scoring provider not configured (or unavailable) — nothing was overwritten',
          rescored,
          failed,
          remaining: totalMock ?? null,
        },
        { status: 503 },
      );
    }
    // Human-anchor calibration — skipped entirely when nothing is fitted
    // (the provider result is already composed; no need to recompose).
    const result = Object.keys(calibration).length
      ? { ...rawResult, ...applyOffsets(rawResult.breakdown, calibration, perf.has_video) }
      : rawResult;
    providerName = result.provider;
    modelName = result.model;

    const { error: updateError } = await service
      .from('scores')
      .update({
        initial_ai_score: result.initialAiScore,
        ai_breakdown: result.breakdown as unknown as Json,
        // Raw (pre-calibration) breakdown for an idempotent calibration refit.
        ai_breakdown_raw: rawResult.breakdown as unknown as Json,
        is_provisional: true,
        ai_provider: result.provider,
        ai_model: result.model,
        scoring_version: SCORING_VERSION,
      })
      .eq('performance_id', perf.id);
    if (updateError) {
      failed++;
      continue;
    }

    // Recompute the blended score exactly like the votes path — a real
    // measurement (if any) still overrides the estimate for measured criteria.
    const { data: measuredRow } = await service
      .from('measured_scores')
      .select('measured_breakdown')
      .eq('performance_id', perf.id)
      .maybeSingle();
    const basis = measuredRow
      ? (measuredAdjustedInitial({
          aiBreakdown: result.breakdown as Partial<Record<Criterion, number>>,
          measured: measuredRow.measured_breakdown as MeasuredBreakdown,
          hasVideo: perf.has_video,
        }) ?? result.initialAiScore)
      : result.initialAiScore;

    const { error: recomputeError } = await service.rpc('recompute_performance_score', {
      p_performance_id: perf.id,
      p_initial_ai_score: basis,
      p_trend_baseline: result.initialAiScore,
    });
    if (recomputeError) {
      failed++;
      continue;
    }
    rescored++;
  }

  return Response.json({
    rescored,
    failed,
    remaining: Math.max(0, (totalMock ?? mockScores.length) - rescored),
    provider: providerName,
    model: modelName,
  });
}
