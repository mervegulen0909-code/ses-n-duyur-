import 'server-only';
import {
  clamp,
  composeInitialAiScore,
  CRITERIA,
  type CriteriaScores,
  type Criterion,
} from '@voxscore/scoring';
import type { createSupabaseServiceClient } from '@/lib/supabase/server';

type ServiceClient = NonNullable<ReturnType<typeof createSupabaseServiceClient>>;

/** Per-criterion additive corrections fitted from human anchors (±10 max). */
export type CalibrationOffsets = Partial<Record<Criterion, number>>;

export interface AnchorPair {
  /** Human anchor criteria (admin_scores.criteria). */
  anchor: Partial<Record<Criterion, number>>;
  /** The LLM breakdown of the SAME performance (scores.ai_breakdown). */
  ai: Partial<Record<Criterion, number>>;
}

const MIN_PAIRS = 5;
const MAX_OFFSET = 10;

/**
 * Mean(anchor − ai) per criterion over pairs where BOTH sides rated it.
 * Below MIN_PAIRS pairs (globally, or for a given criterion) nothing is
 * fitted — a calibration must never be built on noise.
 */
export function computeOffsets(pairs: readonly AnchorPair[]): {
  offsets: CalibrationOffsets;
  sampleCount: number;
} {
  if (pairs.length < MIN_PAIRS) return { offsets: {}, sampleCount: pairs.length };
  const offsets: CalibrationOffsets = {};
  for (const c of CRITERIA) {
    const deltas = pairs
      .map((p) =>
        typeof p.anchor[c] === 'number' && typeof p.ai[c] === 'number'
          ? (p.anchor[c] as number) - (p.ai[c] as number)
          : null,
      )
      .filter((d): d is number => d !== null);
    if (deltas.length < MIN_PAIRS) continue;
    const mean = deltas.reduce((s, d) => s + d, 0) / deltas.length;
    offsets[c] = clamp(Math.round(mean * 100) / 100, -MAX_OFFSET, MAX_OFFSET);
  }
  return { offsets, sampleCount: pairs.length };
}

/**
 * Shift an LLM breakdown by the fitted offsets and recompose the start score.
 * Interpretive-layer correction only (derived from human judgments) — this
 * never invents an objective audio metric (Hard Rule 6).
 */
export function applyOffsets(
  breakdown: CriteriaScores,
  offsets: CalibrationOffsets,
  hasVideo: boolean,
): { breakdown: CriteriaScores; initialAiScore: number } {
  const adjusted = { ...breakdown };
  for (const c of CRITERIA) {
    const off = offsets[c];
    if (typeof off === 'number') adjusted[c] = clamp(adjusted[c] + off, 0, 100);
  }
  return {
    breakdown: adjusted,
    initialAiScore: composeInitialAiScore(adjusted, { hasVideo }),
  };
}

/** Load the fitted offsets (empty map when nothing has been fitted yet). */
export async function loadCalibration(service: ServiceClient): Promise<CalibrationOffsets> {
  const { data } = await service.from('scoring_calibration').select('criterion, offset_value');
  const offsets: CalibrationOffsets = {};
  for (const row of data ?? []) offsets[row.criterion as Criterion] = Number(row.offset_value);
  return offsets;
}
