import { describe, expect, it } from 'vitest';
import {
  analyzeAiJudgeWav,
  constrainedPitchDtwDistance,
  validateMelodyReference,
  type MelodyReference,
} from './ai-judge';
import { concat, silence, sine, SR } from './signals.test';
import { encodeWav } from './wav';

const reference: MelodyReference = {
  durationSeconds: 6,
  notes: [
    { startSeconds: 0, endSeconds: 2, midi: 57, velocity: 35 },
    { startSeconds: 2, endSeconds: 4, midi: 59, velocity: 75 },
    { startSeconds: 4, endSeconds: 6, midi: 60, velocity: 110 },
  ],
};

function melodyBytes(
  frequencies = [220, 246.94165, 261.62557],
  amplitudes = [0.08, 0.25, 0.6],
): Uint8Array {
  return encodeWav(
    concat(
      sine(frequencies[0]!, 2, amplitudes[0]),
      sine(frequencies[1]!, 2, amplitudes[1]),
      sine(frequencies[2]!, 2, amplitudes[2]),
    ),
    SR,
  );
}

const shortTakeOptions = {
  minDurationSeconds: 2,
  maxDurationSeconds: 10,
  minSnrDb: 5,
  minReferenceCoverage: 0.3,
  minAlignmentConfidence: 0.1,
  // Synthetic short takes exercise the measurement math, not the verified
  // score policy, so the production overall-confidence bar is relaxed here.
  minOverallConfidence: 0,
} as const;

describe('melody reference validation', () => {
  it('accepts a sorted monophonic reference', () => {
    expect(() => validateMelodyReference(reference)).not.toThrow();
  });

  it('rejects invalid duration, too few notes, overlap, range, and velocity', () => {
    expect(() => validateMelodyReference({ durationSeconds: 0, notes: reference.notes })).toThrow(
      /duration/,
    );
    expect(() =>
      validateMelodyReference({ durationSeconds: 2, notes: [reference.notes[0]!] }),
    ).toThrow(/two notes/);
    expect(() =>
      validateMelodyReference({
        durationSeconds: 6,
        notes: [reference.notes[0]!, { startSeconds: 1, endSeconds: 3, midi: 200, velocity: 200 }],
      }),
    ).toThrow(/invalid/);

    const invalidNotes = [
      { startSeconds: Number.NaN, endSeconds: 3, midi: 59 },
      { startSeconds: 2, endSeconds: Number.NaN, midi: 59 },
      { startSeconds: -1, endSeconds: 1, midi: 59 },
      { startSeconds: 2, endSeconds: 2, midi: 59 },
      { startSeconds: 2, endSeconds: 7, midi: 59 },
      { startSeconds: 2, endSeconds: 3, midi: Number.NaN },
      { startSeconds: 2, endSeconds: 3, midi: -1 },
      { startSeconds: 2, endSeconds: 3, midi: 128 },
      { startSeconds: 2, endSeconds: 3, midi: 59, velocity: Number.NaN },
      { startSeconds: 2, endSeconds: 3, midi: 59, velocity: -1 },
      { startSeconds: 2, endSeconds: 3, midi: 59, velocity: 128 },
    ];
    for (const invalidNote of invalidNotes) {
      expect(() =>
        validateMelodyReference({
          durationSeconds: 6,
          notes: [reference.notes[0]!, invalidNote],
        }),
      ).toThrow(/invalid/);
    }
  });
});

describe('constrained pitch DTW', () => {
  it('is zero for equal contours and penalizes pitch and voicing mismatches', () => {
    expect(constrainedPitchDtwDistance([57, 59, 60], [57, 59, 60])).toBe(0);
    expect(constrainedPitchDtwDistance([57, null, 60], [57, 59, 60])).toBeGreaterThan(0);
    expect(constrainedPitchDtwDistance([57, 59, 60], [60, 62, 63])).toBeGreaterThan(0.9);
    expect(constrainedPitchDtwDistance([], [57])).toBe(1);
    expect(constrainedPitchDtwDistance([57], [])).toBe(1);
    expect(constrainedPitchDtwDistance([null], [null])).toBeCloseTo(0.05);
  });
});

describe('AI Judge DSP pipeline', () => {
  it('measures a matching, performer-owned WAV against the note reference', () => {
    const result = analyzeAiJudgeWav(melodyBytes(), reference, shortTakeOptions);

    expect(result.qualityGate.passed).toBe(true);
    expect(result.qualityGate.reason).toBeNull();
    expect(result.rawMetrics.detectedTranspositionSemitones).toBe(0);
    expect(result.rawMetrics.rawPitchAccuracy50).toBeGreaterThan(0.9);
    expect(result.measuredBreakdown).not.toBeNull();
    expect(result.measuredBreakdown!.melodyAccuracy).toBeGreaterThan(90);
    expect(result.measuredBreakdown!.pitchControl).toBeGreaterThan(90);
    expect(result.measuredBreakdown!.dynamicPhrasing).toBeGreaterThan(80);
    for (const value of Object.values(result.measuredBreakdown!)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });

  it('is transposition-tolerant but still detects a wrong interval contour', () => {
    const transposed = analyzeAiJudgeWav(
      melodyBytes([440, 493.8833, 523.2511]),
      reference,
      shortTakeOptions,
    );
    const wrong = analyzeAiJudgeWav(melodyBytes([220, 329.6276, 185]), reference, shortTakeOptions);

    expect(transposed.qualityGate.passed).toBe(true);
    expect(transposed.rawMetrics.detectedTranspositionSemitones).toBe(12);
    expect(transposed.measuredBreakdown!.melodyAccuracy).toBeGreaterThan(90);
    expect(wrong.measuredBreakdown?.melodyAccuracy ?? 0).toBeLessThan(
      transposed.measuredBreakdown!.melodyAccuracy,
    );
  });

  it('rejects a take that is too short and emits no score', () => {
    const result = analyzeAiJudgeWav(melodyBytes(), reference);
    expect(result.qualityGate).toMatchObject({ passed: false, reason: 'too_short' });
    expect(result.measuredBreakdown).toBeNull();
  });

  it('rejects a take below the overall-confidence bar instead of scoring it low', () => {
    const result = analyzeAiJudgeWav(melodyBytes(), reference, {
      ...shortTakeOptions,
      minOverallConfidence: 1.01,
    });
    expect(result.qualityGate).toMatchObject({ passed: false, reason: 'low_confidence' });
    expect(result.measuredBreakdown).toBeNull();
  });

  it('rejects each unsafe recording condition before publishing a score', () => {
    const tooLong = analyzeAiJudgeWav(melodyBytes(), reference, {
      ...shortTakeOptions,
      maxDurationSeconds: 5,
    });
    const tooNoisy = analyzeAiJudgeWav(melodyBytes(), reference, {
      ...shortTakeOptions,
      minSnrDb: 1_000,
    });
    const clipped = analyzeAiJudgeWav(melodyBytes(undefined, [1, 1, 1]), reference, {
      ...shortTakeOptions,
      minSnrDb: -1,
    });
    const lowVoicing = analyzeAiJudgeWav(melodyBytes(), reference, {
      ...shortTakeOptions,
      minVoicedRatio: 1.01,
    });
    const mismatch = analyzeAiJudgeWav(melodyBytes(), reference, {
      ...shortTakeOptions,
      minReferenceCoverage: 1.01,
    });

    expect(tooLong.qualityGate.reason).toBe('too_long');
    expect(tooNoisy.qualityGate.reason).toBe('too_noisy');
    expect(clipped.qualityGate.reason).toBe('too_much_clipping');
    expect(lowVoicing.qualityGate.reason).toBe('low_voicing');
    expect(mismatch.qualityGate.reason).toBe('reference_mismatch');
    for (const result of [tooLong, tooNoisy, clipped, lowVoicing, mismatch]) {
      expect(result.measuredBreakdown).toBeNull();
    }
  });

  it('reports low pitch confidence when voiced audio does not overlap the melody reference', () => {
    const gappedReference: MelodyReference = {
      durationSeconds: 6,
      notes: [
        { startSeconds: 1, endSeconds: 2, midi: 57 },
        { startSeconds: 4, endSeconds: 5, midi: 60 },
      ],
    };
    const bytes = encodeWav(concat(sine(220, 0.6), silence(4.8), sine(261.62557, 0.6)), SR);
    const result = analyzeAiJudgeWav(bytes, gappedReference, {
      ...shortTakeOptions,
      minVoicedRatio: 0,
      minReferenceCoverage: 0,
      minAlignmentConfidence: 0,
    });

    expect(result.qualityGate.reason).toBe('low_pitch_confidence');
    expect(result.rawMetrics.detectedTranspositionSemitones).toBeNull();
    expect(result.rawMetrics.medianCentError).toBeNull();
    expect(result.rawMetrics.rawPitchAccuracy50).toBeNull();
    expect(result.measuredBreakdown).toBeNull();
  });

  it('scores missing transition audio as zero instead of inventing a transition', () => {
    const bytes = encodeWav(
      concat(
        sine(220, 1.75),
        silence(0.5),
        sine(246.94165, 1.5),
        silence(0.5),
        sine(261.62557, 1.75),
      ),
      SR,
    );
    const result = analyzeAiJudgeWav(bytes, reference, shortTakeOptions);

    expect(result.qualityGate.passed).toBe(true);
    expect(result.measuredBreakdown?.noteTransitions).toBe(0);
  });

  it('uses measured loudness range when the reference has no velocity intent', () => {
    const noVelocityReference: MelodyReference = {
      ...reference,
      notes: reference.notes.map(({ startSeconds, endSeconds, midi }) => ({
        startSeconds,
        endSeconds,
        midi,
      })),
    };
    const result = analyzeAiJudgeWav(melodyBytes(), noVelocityReference, shortTakeOptions);

    expect(result.qualityGate.passed).toBe(true);
    expect(result.measuredBreakdown?.dynamicPhrasing).toBeGreaterThan(0);
  });
});
