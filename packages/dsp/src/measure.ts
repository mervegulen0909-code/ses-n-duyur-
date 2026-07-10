/**
 * Map measured vocal features to 0–100 sub-scores (ADR 0003).
 *
 * Honesty contract: these four scores are the ONLY ones allowed to carry the
 * "Measured" label — each is a documented, monotonic function of a physically
 * measured quantity. Subjective criteria (emotion, originality, …) stay in
 * the LLM-estimate + community-vote layer and must never be produced here.
 * Each mapping is a PROXY and is named accordingly: pitch control is not the
 * whole of vocal accuracy, but it is a real, measured component of it.
 */

import { extractFeatures, type AnalysisOptions, type VocalFeatures } from './features';
import { parseWav } from './wav';

export interface MeasuredScores {
  /** Proxy for vocalAccuracy: frame-to-frame pitch control. */
  readonly pitchControl: number;
  /** Proxy for rhythmTiming: regularity of note onsets. */
  readonly timingSteadiness: number;
  /** Proxy for technicalSkill: vibrato presence and control. */
  readonly vibratoControl: number;
  /** Recording quality: signal-to-noise ratio, penalized for clipping. */
  readonly recordingQuality: number;
}

/** Which league criteria a measured sub-score may stand in for. */
export const MEASURED_CRITERIA = {
  vocalAccuracy: 'pitchControl',
  rhythmTiming: 'timingSteadiness',
  technicalSkill: 'vibratoControl',
  recordingQuality: 'recordingQuality',
} as const;

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** 0 cents of median jitter → 100; 60+ cents (audibly unstable) → 0. */
export function pitchControlScore(jitterCents: number): number {
  return Math.round(100 * clamp01(1 - jitterCents / 60));
}

/** Onset regularity maps linearly; the neutral 0.5 lands at 50. */
export function timingSteadinessScore(regularity: number): number {
  return Math.round(100 * clamp01(regularity));
}

/**
 * Vibrato control: no vibrato is neutral (50), never a failure. Present
 * vibrato is scored by how close rate sits to the classical 5–7 Hz band and
 * extent to a controlled 20–120 cents.
 */
export function vibratoControlScore(rateHz: number | null, extentCents: number): number {
  if (rateHz === null) return 50;
  const rateQuality = clamp01(1 - Math.abs(rateHz - 6) / 4); // 6 Hz ideal, 0 at ±4 Hz
  const extentQuality = clamp01(1 - Math.abs(extentCents - 70) / 100); // 70¢ ideal
  return Math.round(50 + 50 * rateQuality * extentQuality);
}

/** 5 dB SNR (voice barely above the floor) → 0; 40 dB → 100; clipping deducts. */
export function recordingQualityScore(snrDb: number, clippingRate: number): number {
  const snrScore = 100 * clamp01((snrDb - 5) / 35);
  const clippingPenalty = Math.min(60, clippingRate * 2000);
  return Math.round(Math.max(0, snrScore - clippingPenalty));
}

export function measureScores(features: VocalFeatures): MeasuredScores {
  return {
    pitchControl: pitchControlScore(features.pitchJitterCents),
    timingSteadiness: timingSteadinessScore(features.onsetRegularity),
    vibratoControl: vibratoControlScore(features.vibratoRateHz, features.vibratoExtentCents),
    recordingQuality: recordingQualityScore(features.snrDb, features.clippingRate),
  };
}

export interface Measurement {
  readonly features: VocalFeatures;
  readonly scores: MeasuredScores;
}

/** One-call pipeline: WAV bytes → features → measured sub-scores. */
export function measureWav(bytes: Uint8Array, options: AnalysisOptions = {}): Measurement {
  const audio = parseWav(bytes);
  const features = extractFeatures(audio, options);
  return { features, scores: measureScores(features) };
}
