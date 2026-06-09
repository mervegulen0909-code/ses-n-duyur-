import { assertScore, round } from './util';

/**
 * The 9 scoring criteria. `stagePresence` is video-only: when a performance has
 * no video, it is excluded and the remaining weights are renormalized.
 *
 * Ordering matches the product spec (A) in the plan.
 */
export const CRITERIA = [
  'vocalAccuracy', // perde doğruluğu, detone kontrolü, melodiye sadakat
  'rhythmTiming', // beat uyumu, giriş/çıkış, tempo
  'toneQuality', // ses rengi, tını, doluluk
  'emotionInterpretation', // şarkının ruhu, vurgu, duygusal geçiş
  'technicalSkill', // nefes, vibrato, register geçişleri, dinamik
  'pronunciationDiction', // söz netliği, diksiyon
  'recordingQuality', // gürültü, mix, vokal netliği
  'originality', // kendi yorumu, yaratıcılık
  'stagePresence', // VIDEO-ONLY: sahne duruşu, yüz ifadesi, enerji
] as const;

export type Criterion = (typeof CRITERIA)[number];

/** The single video-only criterion, disabled when `hasVideo` is false. */
export const VIDEO_ONLY_CRITERION: Criterion = 'stagePresence';

/**
 * Default criterion weights. MUST sum to 1.0.
 * Vocal accuracy is weighted highest; stage presence lowest.
 */
export const DEFAULT_CRITERION_WEIGHTS: Readonly<Record<Criterion, number>> = {
  vocalAccuracy: 0.2,
  rhythmTiming: 0.13,
  toneQuality: 0.12,
  emotionInterpretation: 0.13,
  technicalSkill: 0.13,
  pronunciationDiction: 0.09,
  recordingQuality: 0.07,
  originality: 0.08,
  stagePresence: 0.05,
};

export type CriteriaScores = Record<Criterion, number>;

export interface ComposeOptions {
  /** When false, `stagePresence` is excluded and weights renormalized. */
  hasVideo: boolean;
  /** Override the default weights (e.g. for A/B scoring versions). */
  weights?: Readonly<Record<Criterion, number>>;
}

/**
 * Compose the 0–100 Initial AI Score from per-criterion scores.
 *
 * - Each input score must be within [0, 100].
 * - When `hasVideo` is false, `stagePresence` is dropped and the remaining
 *   weights are renormalized so they still sum to 1 (score is "rescaled").
 *
 * IMPORTANT: This function only combines scores it is GIVEN. It never invents
 * objective audio metrics — callers must supply real values (DSP or, in MVP,
 * a clearly-labeled provisional LLM estimate).
 */
export function composeInitialAiScore(scores: CriteriaScores, opts: ComposeOptions): number {
  const weights = opts.weights ?? DEFAULT_CRITERION_WEIGHTS;
  const activeCriteria = opts.hasVideo
    ? CRITERIA
    : CRITERIA.filter((c) => c !== VIDEO_ONLY_CRITERION);

  let weightSum = 0;
  let weighted = 0;
  for (const criterion of activeCriteria) {
    const score = assertScore(scores[criterion], `criteria.${criterion}`);
    const weight = weights[criterion];
    if (weight < 0) throw new RangeError(`weight.${criterion} must be >= 0`);
    weightSum += weight;
    weighted += score * weight;
  }

  if (weightSum <= 0) throw new RangeError('active criterion weights must sum to > 0');

  // Renormalize by the active weight sum (handles the no-video rescale).
  return round(weighted / weightSum, 2);
}
