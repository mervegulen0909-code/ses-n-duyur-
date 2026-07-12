import { describe, expect, it } from 'vitest';
import { CRITERIA, composeInitialAiScore, type Criterion } from '@voxscore/scoring';
import {
  measuredAdjustedInitial,
  measuredDisplayApplies,
  mergeMeasuredBreakdown,
} from './measured';

/** Full 9-criterion estimate, every value 70. */
function estimate(value = 70): Record<Criterion, number> {
  return Object.fromEntries(CRITERIA.map((c) => [c, value])) as Record<Criterion, number>;
}

const MEASURED = { vocalAccuracy: 95, rhythmTiming: 90, technicalSkill: 85, recordingQuality: 80 };

describe('mergeMeasuredBreakdown', () => {
  it('returns the estimate untouched when there is no measurement', () => {
    const ai = estimate();
    expect(mergeMeasuredBreakdown(ai, null)).toBe(ai);
    expect(mergeMeasuredBreakdown(null, null)).toBeNull();
  });

  it('overlays measured values on the estimate', () => {
    const merged = mergeMeasuredBreakdown(estimate(), MEASURED);
    expect(merged?.vocalAccuracy).toBe(95);
    expect(merged?.toneQuality).toBe(70); // untouched estimate
  });

  it('stands alone when there is no stored estimate', () => {
    expect(mergeMeasuredBreakdown(null, MEASURED)).toEqual(MEASURED);
  });
});

describe('measuredAdjustedInitial', () => {
  it('replaces measured criteria in the composition, keeps estimates elsewhere', () => {
    const adjusted = measuredAdjustedInitial({
      aiBreakdown: estimate(),
      measured: MEASURED,
      hasVideo: true,
    });
    const expected = composeInitialAiScore({ ...estimate(), ...MEASURED }, { hasVideo: true });
    expect(adjusted).toBe(expected);
    expect(adjusted!).toBeGreaterThan(70); // measurement lifted the start score
  });

  it('returns null when there is no stored breakdown (caller falls back)', () => {
    expect(
      measuredAdjustedInitial({ aiBreakdown: null, measured: MEASURED, hasVideo: true }),
    ).toBeNull();
  });

  it('returns null when an active criterion is missing from the breakdown', () => {
    const partial: Partial<Record<Criterion, number>> = estimate();
    delete partial.stagePresence;
    expect(
      measuredAdjustedInitial({ aiBreakdown: partial, measured: MEASURED, hasVideo: true }),
    ).toBeNull();
  });

  it('ignores stagePresence when the performance has no video', () => {
    const partial: Partial<Record<Criterion, number>> = estimate();
    delete partial.stagePresence;
    const adjusted = measuredAdjustedInitial({
      aiBreakdown: partial,
      measured: MEASURED,
      hasVideo: false,
    });
    expect(adjusted).not.toBeNull();
  });

  it('returns null instead of throwing on out-of-range jsonb junk', () => {
    const junk = { ...estimate(), toneQuality: 400 };
    expect(
      measuredAdjustedInitial({ aiBreakdown: junk, measured: MEASURED, hasVideo: true }),
    ).toBeNull();
  });
});

describe('measuredDisplayApplies — did the measurement actually blend into the score?', () => {
  it('always applies for an owned upload (no linked video to verify against)', () => {
    expect(measuredDisplayApplies(false, null)).toBe(true);
    expect(measuredDisplayApplies(false, false)).toBe(true);
    expect(measuredDisplayApplies(false, true)).toBe(true);
  });

  it('applies for a YouTube-linked performance only when the duration matched', () => {
    expect(measuredDisplayApplies(true, true)).toBe(true);
  });

  it('does NOT apply for a YouTube-linked performance on mismatch or unknown duration', () => {
    expect(measuredDisplayApplies(true, false)).toBe(false);
    expect(measuredDisplayApplies(true, null)).toBe(false);
  });
});
