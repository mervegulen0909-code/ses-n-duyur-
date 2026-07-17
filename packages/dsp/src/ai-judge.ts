import { analyzeFrames, extractFeatures, median, percentile, type FrameAnalysis } from './features';
import { parseWav } from './wav';

export interface ReferenceNote {
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly midi: number;
  readonly velocity?: number;
}

export interface MelodyReference {
  readonly durationSeconds: number;
  readonly notes: readonly ReferenceNote[];
}

export interface AiJudgeBreakdown {
  readonly melodyAccuracy: number;
  readonly rhythmAccuracy: number;
  readonly pitchControl: number;
  readonly noteTransitions: number;
  readonly sustainControl: number;
  readonly dynamicPhrasing: number;
}

export type QualityRejectionReason =
  | 'too_short'
  | 'too_long'
  | 'too_noisy'
  | 'too_much_clipping'
  | 'low_voicing'
  | 'low_pitch_confidence'
  | 'reference_mismatch'
  | 'low_confidence';

export interface AiJudgeRawMetrics {
  readonly durationSeconds: number;
  readonly voicedRatio: number;
  readonly snrDb: number;
  readonly clippingRate: number;
  readonly medianCentError: number | null;
  readonly rawPitchAccuracy50: number | null;
  readonly voicingRecall: number;
  readonly voicingFalseAlarm: number;
  readonly onsetF1: number | null;
  readonly detectedTranspositionSemitones: number | null;
}

export interface AiJudgeQualityGate {
  readonly passed: boolean;
  readonly reason: QualityRejectionReason | null;
  readonly signalQualityConfidence: number;
  readonly pitchEngineConfidence: number;
  readonly alignmentConfidence: number;
  readonly referenceCoverage: number;
  readonly referenceQualityConfidence: number;
}

export interface AiJudgeMeasurement {
  readonly qualityGate: AiJudgeQualityGate;
  readonly rawMetrics: AiJudgeRawMetrics;
  readonly measuredBreakdown: AiJudgeBreakdown | null;
}

export interface AiJudgeOptions {
  readonly minDurationSeconds?: number;
  readonly maxDurationSeconds?: number;
  readonly minSnrDb?: number;
  readonly maxClippingRate?: number;
  readonly minVoicedRatio?: number;
  readonly minReferenceCoverage?: number;
  readonly minAlignmentConfidence?: number;
  readonly minOverallConfidence?: number;
  /**
   * Onset-match tolerance as a fraction of the take duration. Rubato-aware:
   * pitch metrics absorb tempo flex via DTW, but onsets are still compared on
   * the linear clock — this tolerance is how much local timing freedom a
   * deliberate interpretation gets before rhythm is penalized.
   */
  readonly onsetToleranceNormalized?: number;
}

// minReferenceCoverage and minOverallConfidence implement the score contract:
// a referenced score needs >= 80% melody coverage, and only an overall
// confidence (the minimum of every gate confidence) of >= 0.75 may become an
// ai_verified league score; anything below is a re-record verdict, never a
// low score.
const DEFAULT_OPTIONS = {
  minDurationSeconds: 15,
  maxDurationSeconds: 120,
  minSnrDb: 10,
  maxClippingRate: 0.02,
  minVoicedRatio: 0.2,
  minReferenceCoverage: 0.8,
  minAlignmentConfidence: 0.2,
  minOverallConfidence: 0.75,
  onsetToleranceNormalized: 0.05,
} as const;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const score = (value: number): number => Math.round(100 * clamp01(value) * 100) / 100;
const hzToMidi = (hz: number): number => 69 + 12 * Math.log2(hz / 440);

export function validateMelodyReference(reference: MelodyReference): void {
  if (!Number.isFinite(reference.durationSeconds) || reference.durationSeconds <= 0) {
    throw new Error('reference duration must be positive');
  }
  if (reference.notes.length < 2) throw new Error('reference requires at least two notes');

  let previousEnd = 0;
  for (const note of reference.notes) {
    if (
      !Number.isFinite(note.startSeconds) ||
      !Number.isFinite(note.endSeconds) ||
      note.startSeconds < 0 ||
      note.endSeconds <= note.startSeconds ||
      note.endSeconds > reference.durationSeconds ||
      note.startSeconds < previousEnd ||
      !Number.isFinite(note.midi) ||
      note.midi < 0 ||
      note.midi > 127 ||
      (note.velocity !== undefined &&
        (!Number.isFinite(note.velocity) || note.velocity < 0 || note.velocity > 127))
    ) {
      throw new Error('reference contains an invalid or overlapping note');
    }
    previousEnd = note.endSeconds;
  }
}

function referenceNoteAt(reference: MelodyReference, seconds: number): ReferenceNote | null {
  let low = 0;
  let high = reference.notes.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const note = reference.notes[middle]!;
    if (seconds < note.startSeconds) high = middle - 1;
    else if (seconds >= note.endSeconds) low = middle + 1;
    else return note;
  }
  return null;
}

interface AlignedFrame {
  readonly frame: FrameAnalysis;
  readonly normalizedTime: number;
  readonly referenceNote: ReferenceNote | null;
}

function alignFrames(frames: readonly FrameAnalysis[], reference: MelodyReference): AlignedFrame[] {
  const voiced = frames.filter((frame) => frame.f0Hz !== null);
  if (voiced.length === 0) return [];
  const start = voiced[0]!.timeS;
  const end = voiced[voiced.length - 1]!.timeS;
  const span = Math.max(0.001, end - start);
  return frames
    .filter((frame) => frame.timeS >= start && frame.timeS <= end)
    .map((frame) => {
      const normalizedTime = clamp01((frame.timeS - start) / span);
      return {
        frame,
        normalizedTime,
        referenceNote: referenceNoteAt(reference, normalizedTime * reference.durationSeconds),
      };
    });
}

// Reference-note assignment for the pitch metrics via a banded DTW between the
// measured pitch contour (in the reference key) and the reference note timeline.
// The linear map in `alignFrames` assumes the performance is a constant-tempo
// stretch of the reference, so expressive rubato — holding one note longer,
// rushing the next — bleeds a correctly-sung pitch onto the neighbouring
// reference note and reads as a pitch error. A DTW path follows the tempo
// instead. The band is the same 12% used by `constrainedPitchDtwDistance`: wide
// enough to absorb real rubato, tight enough that a wrong-melody contour cannot
// warp onto same-pitch notes elsewhere in the song. Timing metrics (rhythm,
// transitions) deliberately keep the linear clock — they are meant to measure
// timing. Returns one reference note (or null in a gap) per aligned frame.
function assignNotesByDtw(
  aligned: readonly AlignedFrame[],
  reference: MelodyReference,
  transposition: number,
): (ReferenceNote | null)[] {
  // The caller only reaches here with a detected transposition, which requires
  // several voiced frames — so the window is never empty and never a single
  // frame (Math.max keeps the resampling divisor safe regardless).
  const m = aligned.length;
  // Bound the cost matrix by resampling both sequences onto a shared grid.
  const gridSize = Math.min(600, m);
  const gridSpan = Math.max(1, gridSize - 1);
  const measured = new Array<number | null>(gridSize);
  const slotNote = new Array<ReferenceNote | null>(gridSize);
  for (let s = 0; s < gridSize; s++) {
    const position = s / gridSpan;
    const frame = aligned[Math.round(position * (m - 1))]!.frame;
    measured[s] = frame.f0Hz === null ? null : hzToMidi(frame.f0Hz) - transposition;
    slotNote[s] = referenceNoteAt(reference, position * reference.durationSeconds);
  }

  const band = Math.max(4, Math.ceil(gridSize * 0.12));
  const stepPenalty = 0.05;
  const localCost = (a: number | null, b: number | null): number =>
    a === null && b === null
      ? 0.05
      : a === null || b === null
        ? 0.9
        : Math.min(1, Math.abs(a - b) / 3);
  const cost = new Float64Array(gridSize * gridSize).fill(Number.POSITIVE_INFINITY);
  const dir = new Uint8Array(gridSize * gridSize); // 0 diagonal, 1 hold measured, 2 hold reference
  cost[0] = localCost(measured[0]!, slotNote[0] ? slotNote[0]!.midi : null);
  for (let i = 0; i < gridSize; i++) {
    for (let j = Math.max(0, i - band); j <= Math.min(gridSize - 1, i + band); j++) {
      if (i === 0 && j === 0) continue;
      let best = Number.POSITIVE_INFINITY;
      let step = 0;
      if (i > 0 && j > 0 && cost[(i - 1) * gridSize + (j - 1)]! < best) {
        best = cost[(i - 1) * gridSize + (j - 1)]!;
        step = 0;
      }
      if (i > 0 && cost[(i - 1) * gridSize + j]! + stepPenalty < best) {
        best = cost[(i - 1) * gridSize + j]! + stepPenalty;
        step = 1;
      }
      if (j > 0 && cost[i * gridSize + (j - 1)]! + stepPenalty < best) {
        best = cost[i * gridSize + (j - 1)]! + stepPenalty;
        step = 2;
      }
      cost[i * gridSize + j] =
        localCost(measured[i]!, slotNote[j] ? slotNote[j]!.midi : null) + best;
      dir[i * gridSize + j] = step;
    }
  }

  const gridAssignment = new Array<ReferenceNote | null>(gridSize).fill(null);
  let i = gridSize - 1;
  let j = gridSize - 1;
  for (;;) {
    gridAssignment[i] = slotNote[j]!;
    if (i === 0 && j === 0) break;
    const step = dir[i * gridSize + j]!;
    if (step === 0) {
      i--;
      j--;
    } else if (step === 1) {
      i--;
    } else {
      j--;
    }
  }

  const frameSpan = Math.max(1, m - 1);
  const assignment = new Array<ReferenceNote | null>(m);
  for (let p = 0; p < m; p++) {
    assignment[p] = gridAssignment[Math.round((p / frameSpan) * (gridSize - 1))]!;
  }
  return assignment;
}

// Re-key an aligned window onto a DTW note assignment, preserving each frame's
// (linear) normalized time so the timing metrics are unaffected.
function reassignNotes(
  aligned: readonly AlignedFrame[],
  assignment: readonly (ReferenceNote | null)[],
): AlignedFrame[] {
  return aligned.map((item, index) => ({ ...item, referenceNote: assignment[index]! }));
}

function estimateTransposition(aligned: readonly AlignedFrame[]): number | null {
  const differences = aligned.flatMap(({ frame, referenceNote }) =>
    frame.f0Hz !== null && referenceNote !== null
      ? [hzToMidi(frame.f0Hz) - referenceNote.midi]
      : [],
  );
  if (differences.length < 8) return null;
  return Math.max(-24, Math.min(24, Math.round(median(differences))));
}

function downsamplePitchPairs(
  aligned: readonly AlignedFrame[],
  transposition: number,
): Array<readonly [number | null, number | null]> {
  if (aligned.length === 0) return [];
  const sampleCount = Math.min(600, aligned.length);
  const pairs: Array<readonly [number | null, number | null]> = [];
  for (let i = 0; i < sampleCount; i++) {
    const index = Math.min(
      aligned.length - 1,
      Math.round((i / Math.max(1, sampleCount - 1)) * (aligned.length - 1)),
    );
    const { frame, referenceNote } = aligned[index]!;
    pairs.push([
      frame.f0Hz === null ? null : hzToMidi(frame.f0Hz) - transposition,
      referenceNote?.midi ?? null,
    ]);
  }
  return pairs;
}

/** A bounded, memory-linear DTW distance over measured and reference pitch. */
export function constrainedPitchDtwDistance(
  actual: readonly (number | null)[],
  expected: readonly (number | null)[],
): number {
  if (actual.length === 0 || expected.length === 0) return 1;
  const band = Math.max(
    Math.abs(actual.length - expected.length),
    Math.ceil(Math.max(actual.length, expected.length) * 0.12),
  );
  let previous = new Float64Array(expected.length + 1).fill(Number.POSITIVE_INFINITY);
  previous[0] = 0;

  for (let i = 1; i <= actual.length; i++) {
    const current = new Float64Array(expected.length + 1).fill(Number.POSITIVE_INFINITY);
    const from = Math.max(1, i - band);
    const to = Math.min(expected.length, i + band);
    for (let j = from; j <= to; j++) {
      const a = actual[i - 1]!;
      const b = expected[j - 1]!;
      const local =
        a === null && b === null
          ? 0.05
          : a === null || b === null
            ? 0.9
            : Math.min(1, Math.abs(a - b) / 3);
      current[j] = local + Math.min(previous[j - 1]!, previous[j]! + 0.05, current[j - 1]! + 0.05);
    }
    previous = current;
  }
  return clamp01(previous[expected.length]! / Math.max(actual.length, expected.length));
}

function greedyF1(
  actual: readonly number[],
  expected: readonly number[],
  tolerance: number,
): number {
  if (actual.length === 0 && expected.length === 0) return 1;
  if (actual.length === 0 || expected.length === 0) return 0;
  const used = new Set<number>();
  let matches = 0;
  for (const value of actual) {
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < expected.length; i++) {
      if (used.has(i)) continue;
      const distance = Math.abs(value - expected[i]!);
      if (distance <= tolerance && distance < bestDistance) {
        bestIndex = i;
        bestDistance = distance;
      }
    }
    if (bestIndex >= 0) {
      used.add(bestIndex);
      matches++;
    }
  }
  const precision = matches / actual.length;
  const recall = matches / expected.length;
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

function transitionTimes(aligned: readonly AlignedFrame[]): number[] {
  const transitions: number[] = [];
  let previousMidi: number | null = null;
  for (const item of aligned) {
    const currentMidi = item.frame.f0Hz === null ? null : hzToMidi(item.frame.f0Hz);
    if (
      currentMidi !== null &&
      previousMidi !== null &&
      Math.abs(currentMidi - previousMidi) >= 0.8 &&
      item.normalizedTime - (transitions.at(-1) ?? -1) >= 0.01
    ) {
      transitions.push(item.normalizedTime);
    }
    if (currentMidi !== null) previousMidi = currentMidi;
  }
  return transitions;
}

function transitionIntervalScore(
  aligned: readonly AlignedFrame[],
  reference: MelodyReference,
  transposition: number,
): number {
  const qualities: number[] = [];
  for (let i = 1; i < reference.notes.length; i++) {
    const before = reference.notes[i - 1]!;
    const after = reference.notes[i]!;
    const boundary = after.startSeconds / reference.durationSeconds;
    const nearbyBefore = aligned
      .filter(
        (item) =>
          item.frame.f0Hz !== null &&
          item.normalizedTime < boundary &&
          boundary - item.normalizedTime <= 0.04,
      )
      .at(-1);
    const nearbyAfter = aligned.find(
      (item) =>
        item.frame.f0Hz !== null &&
        item.normalizedTime >= boundary &&
        item.normalizedTime - boundary <= 0.04,
    );
    if (!nearbyBefore?.frame.f0Hz || !nearbyAfter?.frame.f0Hz) continue;
    const actualInterval =
      hzToMidi(nearbyAfter.frame.f0Hz) -
      transposition -
      (hzToMidi(nearbyBefore.frame.f0Hz) - transposition);
    const expectedInterval = after.midi - before.midi;
    qualities.push(clamp01(1 - Math.abs(actualInterval - expectedInterval) / 2));
  }
  return qualities.length === 0
    ? 0
    : qualities.reduce((sum, value) => sum + value, 0) / qualities.length;
}

function noteStability(
  aligned: readonly AlignedFrame[],
  reference: MelodyReference,
  transposition: number,
): { pitchControl: number; sustainControl: number } {
  const noteMedians: number[] = [];
  const noteSpreads: number[] = [];
  for (const note of reference.notes) {
    const errors = aligned.flatMap((item) =>
      item.referenceNote === note && item.frame.f0Hz !== null
        ? [Math.abs((hzToMidi(item.frame.f0Hz) - transposition - note.midi) * 100)]
        : [],
    );
    if (errors.length < 4) continue;
    noteMedians.push(median(errors));
    noteSpreads.push(percentile(errors, 0.75) - percentile(errors, 0.25));
  }
  return {
    pitchControl: noteMedians.length === 0 ? 0 : clamp01(1 - median(noteMedians) / 100),
    sustainControl: noteSpreads.length === 0 ? 0 : clamp01(1 - median(noteSpreads) / 80),
  };
}

function dynamicPhrasingScore(
  aligned: readonly AlignedFrame[],
  reference: MelodyReference,
): number {
  const measured: number[] = [];
  const intended: number[] = [];
  for (const note of reference.notes) {
    const levels = aligned.flatMap((item) =>
      item.referenceNote === note && item.frame.f0Hz !== null ? [item.frame.rmsDb] : [],
    );
    if (levels.length === 0) continue;
    measured.push(median(levels));
    if (note.velocity !== undefined) intended.push(note.velocity);
  }
  if (measured.length < 2) return 0.5;
  if (intended.length !== measured.length) {
    const range = Math.max(...measured) - Math.min(...measured);
    return clamp01(range / 12);
  }
  const meanA = measured.reduce((sum, value) => sum + value, 0) / measured.length;
  const meanB = intended.reduce((sum, value) => sum + value, 0) / intended.length;
  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;
  for (let i = 0; i < measured.length; i++) {
    const a = measured[i]! - meanA;
    const b = intended[i]! - meanB;
    covariance += a * b;
    varianceA += a * a;
    varianceB += b * b;
  }
  if (varianceA === 0 || varianceB === 0) return 0.5;
  return clamp01((covariance / Math.sqrt(varianceA * varianceB) + 1) / 2);
}

export function analyzeAiJudgeWav(
  bytes: Uint8Array,
  reference: MelodyReference,
  options: AiJudgeOptions = {},
): AiJudgeMeasurement {
  validateMelodyReference(reference);
  const resolved = { ...DEFAULT_OPTIONS, ...options };
  const audio = parseWav(bytes);
  const features = extractFeatures(audio);
  const frames = analyzeFrames(audio);
  const aligned = alignFrames(frames, reference);
  const transposition = estimateTransposition(aligned);
  const pitchPairs = transposition === null ? [] : downsamplePitchPairs(aligned, transposition);
  const alignmentDistance =
    pitchPairs.length === 0
      ? 1
      : constrainedPitchDtwDistance(
          pitchPairs.map(([actual]) => actual),
          pitchPairs.map(([, expected]) => expected),
        );
  const alignmentConfidence = clamp01(1 - alignmentDistance);

  // Coverage / false-alarm feed the quality gate off the linear clock, unchanged.
  const expectedFrames = aligned.filter((item) => item.referenceNote !== null);
  const expectedVoiced = expectedFrames.filter((item) => item.frame.f0Hz !== null);
  const gapFrames = aligned.filter((item) => item.referenceNote === null);
  const falseAlarms = gapFrames.filter((item) => item.frame.f0Hz !== null).length;
  const referenceCoverage =
    expectedFrames.length === 0 ? 0 : expectedVoiced.length / expectedFrames.length;
  const voicingFalseAlarm = gapFrames.length === 0 ? 0 : falseAlarms / gapFrames.length;

  // Pitch metrics judge which note each frame *sang*, not when — so they follow
  // a DTW warp of the reference timeline instead of the rigid linear clock.
  const pitchAligned =
    transposition === null
      ? aligned
      : reassignNotes(aligned, assignNotesByDtw(aligned, reference, transposition));
  const pitchVoiced = pitchAligned.filter(
    (item) => item.referenceNote !== null && item.frame.f0Hz !== null,
  );
  const centErrors =
    transposition === null
      ? []
      : pitchVoiced.map((item) =>
          Math.abs((hzToMidi(item.frame.f0Hz!) - transposition - item.referenceNote!.midi) * 100),
        );
  const medianCentError = centErrors.length === 0 ? null : median(centErrors);
  const rawPitchAccuracy50 =
    centErrors.length === 0
      ? null
      : centErrors.filter((error) => error <= 50).length / centErrors.length;

  const expectedTransitions = reference.notes
    .slice(1)
    .map((note) => note.startSeconds / reference.durationSeconds);
  const actualTransitions = transitionTimes(aligned);
  const onsetF1 = greedyF1(
    actualTransitions,
    expectedTransitions,
    resolved.onsetToleranceNormalized,
  );
  const stability =
    transposition === null
      ? { pitchControl: 0, sustainControl: 0 }
      : noteStability(pitchAligned, reference, transposition);

  // Confidence curves are calibrated so a take that clears the quality gates
  // by a healthy margin can actually reach the 0.75 verified threshold —
  // a curve demanding studio-grade SNR would silently reject honest phone
  // recordings that the gate itself declared acceptable.
  const signalQualityConfidence = Math.min(
    clamp01((features.snrDb - 8) / 12),
    clamp01(1 - features.clippingRate / Math.max(0.0001, resolved.maxClippingRate)),
  );
  const pitchEngineConfidence = clamp01(features.voicedRatio / 0.4);
  // 6 clean reference notes are enough for full confidence in the reference
  // itself; requiring 12 made short references mathematically unverifiable.
  const referenceQualityConfidence = clamp01(reference.notes.length / 8);

  let reason: QualityRejectionReason | null = null;
  if (features.durationS < resolved.minDurationSeconds) reason = 'too_short';
  else if (features.durationS > resolved.maxDurationSeconds) reason = 'too_long';
  else if (features.snrDb < resolved.minSnrDb) reason = 'too_noisy';
  else if (features.clippingRate > resolved.maxClippingRate) reason = 'too_much_clipping';
  else if (features.voicedRatio < resolved.minVoicedRatio) reason = 'low_voicing';
  else if (pitchEngineConfidence < 0.45 || transposition === null) reason = 'low_pitch_confidence';
  else if (
    referenceCoverage < resolved.minReferenceCoverage ||
    alignmentConfidence < resolved.minAlignmentConfidence
  )
    reason = 'reference_mismatch';
  else if (
    Math.min(
      signalQualityConfidence,
      pitchEngineConfidence,
      alignmentConfidence,
      referenceCoverage,
      referenceQualityConfidence,
    ) < resolved.minOverallConfidence
  )
    reason = 'low_confidence';

  const rawMetrics: AiJudgeRawMetrics = {
    durationSeconds: features.durationS,
    voicedRatio: features.voicedRatio,
    snrDb: features.snrDb,
    clippingRate: features.clippingRate,
    medianCentError,
    rawPitchAccuracy50,
    voicingRecall: referenceCoverage,
    voicingFalseAlarm,
    onsetF1,
    detectedTranspositionSemitones: transposition,
  };
  const qualityGate: AiJudgeQualityGate = {
    passed: reason === null,
    reason,
    signalQualityConfidence,
    pitchEngineConfidence,
    alignmentConfidence,
    referenceCoverage,
    referenceQualityConfidence,
  };

  if (
    reason !== null ||
    medianCentError === null ||
    rawPitchAccuracy50 === null ||
    transposition === null
  ) {
    return { qualityGate, rawMetrics, measuredBreakdown: null };
  }

  return {
    qualityGate,
    rawMetrics,
    measuredBreakdown: {
      melodyAccuracy: score(0.65 * rawPitchAccuracy50 + 0.35 * clamp01(1 - medianCentError / 150)),
      rhythmAccuracy: score(onsetF1),
      pitchControl: score(stability.pitchControl),
      noteTransitions: score(transitionIntervalScore(aligned, reference, transposition)),
      sustainControl: score(stability.sustainControl),
      dynamicPhrasing: score(dynamicPhrasingScore(pitchAligned, reference)),
    },
  };
}
