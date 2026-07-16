import { describe, expect, it } from 'vitest';
import {
  aiJudgeBreakdownSchema,
  analyzerResultSchema,
  createAnalysisSessionSchema,
  publishSongReferenceSchema,
  scoreStatusSchema,
} from './analysis';

const validResult = {
  sessionId: '11111111-1111-4111-8111-111111111111',
  pipelineVersion: 1,
  pitchEngine: 'yin',
  pitchEngineVersion: '1',
  audioSha256: 'a'.repeat(64),
  qualityGate: {
    passed: true,
    reason: null,
    signalQualityConfidence: 0.9,
    pitchEngineConfidence: 0.8,
    alignmentConfidence: 0.85,
    referenceCoverage: 0.95,
    referenceQualityConfidence: 1,
  },
  rawMetrics: {
    durationSeconds: 60,
    voicedRatio: 0.8,
    snrDb: 30,
    clippingRate: 0,
    medianCentError: 18,
    rawPitchAccuracy50: 0.92,
    voicingRecall: 0.9,
    voicingFalseAlarm: 0.05,
    onsetF1: 0.88,
    detectedTranspositionSemitones: -2,
  },
  measuredBreakdown: {
    melodyAccuracy: 90,
    rhythmAccuracy: 86,
    pitchControl: 82,
    noteTransitions: 80,
    sustainControl: 84,
    dynamicPhrasing: 78,
  },
};

describe('analysis schemas', () => {
  it('accepts the session and analyzer contracts', () => {
    expect(
      createAnalysisSessionSchema.parse({
        performanceId: '11111111-1111-4111-8111-111111111111',
        mode: 'song_reference',
      }).mode,
    ).toBe('song_reference');
    expect(analyzerResultSchema.parse(validResult).pitchEngine).toBe('yin');
    expect(scoreStatusSchema.parse('ai_verified')).toBe('ai_verified');
  });

  it('requires all measured criteria in range', () => {
    expect(() => aiJudgeBreakdownSchema.parse({ melodyAccuracy: 80 })).toThrow();
    expect(() =>
      aiJudgeBreakdownSchema.parse({ ...validResult.measuredBreakdown, pitchControl: 101 }),
    ).toThrow();
  });

  it('requires a breakdown for passed analyses', () => {
    expect(() => analyzerResultSchema.parse({ ...validResult, measuredBreakdown: null })).toThrow(
      /measured breakdown/,
    );
  });

  it('requires a reason for rejected analyses', () => {
    expect(() =>
      analyzerResultSchema.parse({
        ...validResult,
        qualityGate: { ...validResult.qualityGate, passed: false },
        measuredBreakdown: null,
      }),
    ).toThrow(/requires a reason/);

    expect(
      analyzerResultSchema.parse({
        ...validResult,
        qualityGate: { ...validResult.qualityGate, passed: false, reason: 'too_noisy' },
        measuredBreakdown: null,
      }).qualityGate.reason,
    ).toBe('too_noisy');
  });

  it('rejects malformed hashes, metrics, statuses, and session identifiers', () => {
    expect(() => analyzerResultSchema.parse({ ...validResult, audioSha256: 'nope' })).toThrow();
    expect(() =>
      analyzerResultSchema.parse({
        ...validResult,
        rawMetrics: { ...validResult.rawMetrics, voicedRatio: 2 },
      }),
    ).toThrow();
    expect(() => scoreStatusSchema.parse('provisional')).toThrow();
    expect(() =>
      createAnalysisSessionSchema.parse({ performanceId: 'not-a-uuid', mode: 'song_reference' }),
    ).toThrow();
  });

  it('allows zero duration so a malformed WAV rejection can be reported', () => {
    expect(
      analyzerResultSchema.safeParse({
        ...validResult,
        qualityGate: { ...validResult.qualityGate, passed: false, reason: 'invalid_wav' },
        rawMetrics: { ...validResult.rawMetrics, durationSeconds: 0 },
        measuredBreakdown: null,
      }).success,
    ).toBe(true);
  });

  it('validates sorted monophonic song references', () => {
    const input = {
      songId: '11111111-1111-4111-8111-111111111111',
      sourceType: 'admin_annotation',
      durationSeconds: 3,
      notes: [
        { startSeconds: 0, endSeconds: 1, midi: 60 },
        { startSeconds: 1, endSeconds: 3, midi: 62 },
      ],
    };
    expect(publishSongReferenceSchema.safeParse(input).success).toBe(true);
    expect(
      publishSongReferenceSchema.safeParse({
        ...input,
        notes: [input.notes[1], input.notes[0]],
      }).success,
    ).toBe(false);
    expect(
      publishSongReferenceSchema.safeParse({
        ...input,
        notes: [{ startSeconds: 0, endSeconds: 0, midi: 60 }],
      }).success,
    ).toBe(false);
  });
});
