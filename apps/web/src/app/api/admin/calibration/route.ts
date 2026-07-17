import type { Criterion } from '@voxscore/scoring';
import { computeOffsets, type AnchorPair } from '@/lib/calibration';
import { getProfileForContext } from '@/lib/auth';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';

/**
 * Admin: refit the per-criterion calibration offsets from admin_scores human
 * anchors paired with the LLM breakdown of the same performances. Closes the
 * feedback loop admin_scores was designed for — before this, anchors were
 * write-only.
 */
export async function POST(req: Request): Promise<Response> {
  const ctx = await getRequestContext(req);
  if (!ctx) return Response.json({ error: 'Forbidden' }, { status: 403 });
  if ((await getProfileForContext(ctx))?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  const service = createSupabaseServiceClient();
  if (!service) return Response.json({ error: 'Server not configured' }, { status: 503 });

  const { data: anchors, error } = await service
    .from('admin_scores')
    .select('performance_id, criteria');
  if (error) return Response.json({ error: 'Could not load anchors' }, { status: 500 });

  // Fit against the RAW (uncalibrated) LLM breakdown, never scores.ai_breakdown
  // (which already has the prior offset baked in — fitting against it makes the
  // offset regress toward zero). Rows without a raw breakdown (created before
  // the column existed) yield an empty `ai` and are dropped below.
  const perfIds = [...new Set((anchors ?? []).map((a) => a.performance_id))];
  const { data: scoreRows } = perfIds.length
    ? await service
        .from('scores')
        .select('performance_id, ai_breakdown_raw')
        .in('performance_id', perfIds)
    : { data: [] };
  const aiByPerf = new Map((scoreRows ?? []).map((s) => [s.performance_id, s.ai_breakdown_raw]));

  const pairs: AnchorPair[] = (anchors ?? [])
    .map((a) => ({
      anchor: (a.criteria ?? {}) as Partial<Record<Criterion, number>>,
      ai: (aiByPerf.get(a.performance_id) ?? {}) as Partial<Record<Criterion, number>>,
    }))
    .filter((p) => Object.keys(p.ai).length > 0);

  const { offsets, sampleCount } = computeOffsets(pairs);

  // A criterion that fell below the sample floor must not keep serving its
  // OLD offset forever — clear anything this refit did not (re)produce.
  const fittedCriteria = Object.keys(offsets);
  const staleDelete = fittedCriteria.length
    ? service
        .from('scoring_calibration')
        .delete()
        .not('criterion', 'in', `(${fittedCriteria.map((c) => `"${c}"`).join(',')})`)
    : service.from('scoring_calibration').delete().not('criterion', 'is', null);
  const { error: staleError } = await staleDelete;
  if (staleError) {
    return Response.json({ error: 'Could not clear stale calibration' }, { status: 500 });
  }

  for (const [criterion, offset] of Object.entries(offsets)) {
    const { error: upsertError } = await service.from('scoring_calibration').upsert(
      {
        criterion,
        offset_value: offset,
        sample_count: sampleCount,
        fitted_at: new Date().toISOString(),
      },
      { onConflict: 'criterion' },
    );
    if (upsertError) {
      return Response.json({ error: 'Could not store calibration' }, { status: 500 });
    }
  }
  return Response.json({ sampleCount, offsets });
}
