import { analyzerResultSchema } from '@voxscore/core';
import type { Json } from '@voxscore/db';
import { AI_JUDGE_MIN_VERIFIED_CONFIDENCE, composeAiJudgeScore } from '@voxscore/scoring';
import { verifyAnalyzerCallbackSignature } from '@/lib/analysis-signature';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();
  if (
    !verifyAnalyzerCallbackSignature(
      rawBody,
      req.headers.get('x-voxscore-timestamp'),
      req.headers.get('x-voxscore-signature'),
    )
  ) {
    return Response.json({ error: 'Invalid Analyzer signature' }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = analyzerResultSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid Analyzer result' }, { status: 422 });
  }

  const service = createSupabaseServiceClient();
  if (!service) return Response.json({ error: 'Database unavailable' }, { status: 503 });

  let result = parsed.data;
  const overallConfidence = Math.min(
    result.qualityGate.signalQualityConfidence,
    result.qualityGate.pitchEngineConfidence,
    result.qualityGate.alignmentConfidence,
    result.qualityGate.referenceCoverage,
    result.qualityGate.referenceQualityConfidence,
  );
  // Server-side backstop independent of the Analyzer image: a sub-threshold
  // confidence must never become an ai_verified league score, only a
  // re-record verdict. The breakdown is kept on the stored result for audit.
  if (result.qualityGate.passed && overallConfidence < AI_JUDGE_MIN_VERIFIED_CONFIDENCE) {
    result = {
      ...result,
      qualityGate: { ...result.qualityGate, passed: false, reason: 'low_confidence' },
    };
  }
  const breakdown = result.measuredBreakdown;
  const passed = result.qualityGate.passed && breakdown !== null;
  const aiScore = passed && breakdown ? composeAiJudgeScore(breakdown) : null;
  const confidence = passed ? overallConfidence : null;

  const { data: resultId, error } = await service.rpc('finalize_ai_analysis', {
    p_session_id: result.sessionId,
    p_result: result as unknown as Json,
    p_ai_score: aiScore,
    p_confidence: confidence,
  });
  if (error || !resultId) {
    console.error(`[analysis-results] finalize failed for ${result.sessionId}`, error);
    return Response.json({ error: 'Could not finalize AI analysis' }, { status: 500 });
  }

  return Response.json({ ok: true, resultId, aiScore, confidence });
}
