import { describe, expect, it } from 'vitest';
import { applyOffsets, computeOffsets } from './calibration';

const ai = {
  vocalAccuracy: 70,
  rhythmTiming: 70,
  toneQuality: 70,
  emotionInterpretation: 70,
  technicalSkill: 70,
  pronunciationDiction: 70,
  recordingQuality: 70,
  originality: 70,
  stagePresence: 70,
};

describe('computeOffsets', () => {
  it('returns empty below 5 anchor pairs (never fit on noise)', () => {
    expect(computeOffsets([{ anchor: { vocalAccuracy: 90 }, ai }]).offsets).toEqual({});
  });

  it('shrunk mean(anchor − ai) per criterion, clamped to ±10', () => {
    const pairs = Array.from({ length: 5 }, () => ({
      anchor: { vocalAccuracy: 95, toneQuality: 40 },
      ai,
    }));
    const { offsets, sampleCount } = computeOffsets(pairs);
    expect(sampleCount).toBe(5);
    // Small samples shrink toward zero: n/(n+10) = 5/15 = 1/3 of the raw mean.
    expect(offsets.vocalAccuracy).toBe(8.33); // +25 shrunk to +8.33
    expect(offsets.toneQuality).toBe(-10); // −30 shrunk to −10, at the clamp
    expect(offsets.rhythmTiming).toBeUndefined(); // anchor never rated it
  });
});

describe('applyOffsets', () => {
  it('shifts only calibrated criteria, clamps 0..100, recomposes the initial score', () => {
    const out = applyOffsets({ ...ai }, { vocalAccuracy: 10, recordingQuality: -10 }, true);
    expect(out.breakdown.vocalAccuracy).toBe(80);
    expect(out.breakdown.recordingQuality).toBe(60);
    expect(out.breakdown.toneQuality).toBe(70);
    // recomposed: 70 + 0.20*10 − 0.07*10 = 71.3
    expect(out.initialAiScore).toBeCloseTo(71.3, 2);
  });

  it('empty offsets are the identity', () => {
    const out = applyOffsets({ ...ai }, {}, true);
    expect(out.initialAiScore).toBe(70);
  });
});
