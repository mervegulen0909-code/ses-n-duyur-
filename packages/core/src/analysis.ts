import { AI_JUDGE_CRITERIA } from '@voxscore/scoring';
import { z } from 'zod';

export const analysisModeSchema = z.enum(['song_reference', 'technique_test']);
export type AnalysisMode = z.infer<typeof analysisModeSchema>;

export const analysisSessionStatusSchema = z.enum([
  'created',
  'uploading',
  'processing',
  'completed',
  'rejected',
  'failed',
  'expired',
]);
export type AnalysisSessionStatus = z.infer<typeof analysisSessionStatusSchema>;

export const scoreStatusSchema = z.enum([
  'unscored',
  'reference_required',
  'analysis_pending',
  'quality_rejected',
  'technique_only',
  'ai_verified',
  'provisional_estimate',
  'legacy_metadata',
  'analysis_failed',
]);
export type ScoreStatus = z.infer<typeof scoreStatusSchema>;

/**
 * Statuses whose score is real enough to display, rank, and vote on.
 * 'ai_verified' is a DSP measurement of the performer's own recording;
 * 'provisional_estimate' (and its pre-rename value 'legacy_metadata') is a
 * clearly-labeled metadata estimate — rankable, but never presented as a
 * measurement, and its listener vote weight is capped until verified.
 */
export const RANKED_SCORE_STATUSES = [
  'ai_verified',
  'provisional_estimate',
  'legacy_metadata',
] as const;

export function isRankedScoreStatus(status: string | null | undefined): boolean {
  return (RANKED_SCORE_STATUSES as readonly string[]).includes(status ?? '');
}

export const analysisQualityReasonSchema = z.enum([
  'invalid_wav',
  'too_short',
  'too_long',
  'too_noisy',
  'too_much_clipping',
  'low_voicing',
  'low_pitch_confidence',
  'reference_mismatch',
  'low_confidence',
  'polyphonic_input',
]);
export type AnalysisQualityReason = z.infer<typeof analysisQualityReasonSchema>;

const confidenceSchema = z.number().finite().min(0).max(1);
const scoreSchema = z.number().finite().min(0).max(100);

export const aiJudgeBreakdownSchema = z.object(
  Object.fromEntries(AI_JUDGE_CRITERIA.map((criterion) => [criterion, scoreSchema])) as Record<
    (typeof AI_JUDGE_CRITERIA)[number],
    typeof scoreSchema
  >,
);

export const analysisQualityGateSchema = z.object({
  passed: z.boolean(),
  reason: analysisQualityReasonSchema.nullable(),
  signalQualityConfidence: confidenceSchema,
  pitchEngineConfidence: confidenceSchema,
  alignmentConfidence: confidenceSchema,
  referenceCoverage: confidenceSchema,
  referenceQualityConfidence: confidenceSchema,
});

export const analysisRawMetricsSchema = z.object({
  durationSeconds: z.number().finite().nonnegative(),
  voicedRatio: confidenceSchema,
  snrDb: z.number().finite(),
  clippingRate: confidenceSchema,
  medianCentError: z.number().finite().nonnegative().nullable(),
  rawPitchAccuracy50: confidenceSchema.nullable(),
  voicingRecall: confidenceSchema,
  voicingFalseAlarm: confidenceSchema,
  onsetF1: confidenceSchema.nullable(),
  detectedTranspositionSemitones: z.number().int().min(-24).max(24).nullable(),
});

export const createAnalysisSessionSchema = z.object({
  performanceId: z.string().uuid(),
  mode: analysisModeSchema,
});

export const referenceNoteSchema = z
  .object({
    startSeconds: z.number().finite().nonnegative(),
    endSeconds: z.number().finite().positive(),
    midi: z.number().finite().min(0).max(127),
    velocity: z.number().finite().min(0).max(127).optional(),
  })
  .refine((note) => note.endSeconds > note.startSeconds, {
    message: 'Reference note end must be after start',
  });

export const publishSongReferenceSchema = z
  .object({
    songId: z.string().uuid(),
    sourceType: z.enum(['licensed_midi', 'admin_annotation']),
    durationSeconds: z
      .number()
      .finite()
      .positive()
      .max(15 * 60),
    tonicMidi: z.number().int().min(0).max(127).nullable().optional(),
    notes: z.array(referenceNoteSchema).min(2).max(10_000),
  })
  .superRefine((value, ctx) => {
    let previousEnd = 0;
    value.notes.forEach((note, index) => {
      if (note.startSeconds < previousEnd || note.endSeconds > value.durationSeconds) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['notes', index],
          message: 'Reference notes must be sorted, monophonic, and inside the duration',
        });
      }
      previousEnd = note.endSeconds;
    });
  });

export const analyzerResultSchema = z
  .object({
    sessionId: z.string().uuid(),
    pipelineVersion: z.number().int().positive(),
    pitchEngine: z.string().trim().min(1).max(50),
    pitchEngineVersion: z.string().trim().min(1).max(100),
    audioSha256: z.string().regex(/^[a-f0-9]{64}$/),
    qualityGate: analysisQualityGateSchema,
    rawMetrics: analysisRawMetricsSchema,
    measuredBreakdown: aiJudgeBreakdownSchema.nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.qualityGate.passed && value.measuredBreakdown === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['measuredBreakdown'],
        message: 'A passed quality gate requires a measured breakdown',
      });
    }
    if (!value.qualityGate.passed && value.qualityGate.reason === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['qualityGate', 'reason'],
        message: 'A rejected quality gate requires a reason',
      });
    }
  });

export type CreateAnalysisSessionInput = z.infer<typeof createAnalysisSessionSchema>;
export type PublishSongReferenceInput = z.infer<typeof publishSongReferenceSchema>;
export type AnalyzerResult = z.infer<typeof analyzerResultSchema>;
