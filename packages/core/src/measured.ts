import {
  composeInitialAiScore,
  CRITERIA,
  VIDEO_ONLY_CRITERION,
  type Criterion,
  type CriteriaScores,
} from '@voxscore/scoring';

/**
 * Per-criterion 0-100 values measured by real DSP from the performer's own
 * submitted recording (ADR 0003). Only the objective criteria are ever present
 * (the @voxscore/dsp MEASURED_CRITERIA map decides which); everything else
 * stays an LLM estimate / human votes.
 */
export type MeasuredBreakdown = Partial<Record<Criterion, number>>;

/**
 * Merge a measurement over the stored AI breakdown for display: measured
 * criteria show the measured value, the rest keep the estimate.
 */
export function mergeMeasuredBreakdown(
  aiBreakdown: Partial<Record<Criterion, number>> | null,
  measured: MeasuredBreakdown | null,
): Partial<Record<Criterion, number>> | null {
  if (!measured) return aiBreakdown;
  return { ...(aiBreakdown ?? {}), ...measured };
}

export interface MeasuredAdjustedInput {
  /** The stored LLM-estimate breakdown (scores.ai_breakdown) — never mutated. */
  readonly aiBreakdown: Partial<Record<Criterion, number>> | null;
  readonly measured: MeasuredBreakdown;
  readonly hasVideo: boolean;
}

/**
 * Effective AI-start score once a real measurement exists: measured criteria
 * replace the LLM estimate in the composition, the rest keep the estimate.
 *
 * Returns null when the stored breakdown is unusable (missing criteria or
 * out-of-range values from the DB) — the caller falls back to the stored
 * initial_ai_score so a bad row can never break score recomputation.
 */
export function measuredAdjustedInitial(input: MeasuredAdjustedInput): number | null {
  if (!input.aiBreakdown) return null;

  const merged: Partial<Record<Criterion, number>> = {};
  for (const criterion of CRITERIA) {
    if (!input.hasVideo && criterion === VIDEO_ONLY_CRITERION) continue;
    const value = input.measured[criterion] ?? input.aiBreakdown[criterion];
    if (typeof value !== 'number') return null;
    merged[criterion] = value;
  }

  try {
    return composeInitialAiScore(merged as CriteriaScores, { hasVideo: input.hasVideo });
  } catch {
    return null; // out-of-range junk in a jsonb column must not throw upstream
  }
}
