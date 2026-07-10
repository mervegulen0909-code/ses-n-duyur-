import { describe, expect, it } from 'vitest';
import {
  analyzeFrames,
  centsBetween,
  detectOnsets,
  estimateVibrato,
  extractFeatures,
  median,
  movingAverage,
  percentile,
  type FrameAnalysis,
} from './features';
import { bursts, concat, noise, silence, sine, vibratoSine, SR } from './signals.test';

function audio(samples: Float32Array) {
  return { sampleRate: SR, samples };
}

/** Synthetic frame sequence with the given RMS-dB pattern (all unvoiced). */
function framesWithDb(pattern: readonly number[], hopS = 0.032): FrameAnalysis[] {
  return pattern.map((rmsDb, i) => ({ timeS: i * hopS, f0Hz: null, rmsDb }));
}

describe('math helpers', () => {
  it('percentile interpolates and rejects empty input', () => {
    expect(percentile([1, 2, 3, 4], 0)).toBe(1);
    expect(percentile([1, 2, 3, 4], 1)).toBe(4);
    expect(percentile([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5, 10);
    expect(() => percentile([], 0.5)).toThrow(/empty/);
  });

  it('median of an odd-length list is the middle value', () => {
    expect(median([9, 1, 5])).toBe(5);
  });

  it('centsBetween: one octave is 1200 cents, symmetric in sign', () => {
    expect(centsBetween(220, 440)).toBeCloseTo(1200, 6);
    expect(centsBetween(440, 220)).toBeCloseTo(-1200, 6);
  });

  it('movingAverage smooths with edge-clamped windows', () => {
    expect(movingAverage([0, 10, 20], 3)).toEqual([5, 10, 15]);
  });
});

describe('analyzeFrames', () => {
  it('marks tonal frames voiced and silence unvoiced', () => {
    const frames = analyzeFrames(audio(concat(sine(220, 1), silence(1))));
    const voiced = frames.filter((f) => f.f0Hz !== null);
    const unvoiced = frames.filter((f) => f.f0Hz === null);
    expect(voiced.length).toBeGreaterThan(20);
    expect(unvoiced.length).toBeGreaterThan(20);
    expect(voiced[5]!.f0Hz!).toBeCloseTo(220, 0);
  });

  it('floors the dB of near-silent (but non-zero) frames', () => {
    const tiny = sine(220, 0.5, 1e-6);
    const frames = analyzeFrames(audio(tiny));
    expect(frames[0]!.rmsDb).toBe(-70);
  });
});

describe('estimateVibrato', () => {
  it('reports none for a contour shorter than one second', () => {
    expect(estimateVibrato([0, 1, 2], 31.25)).toEqual({ rateHz: null, extentCents: 0 });
  });

  it('reports none for a flat contour (steady pitch)', () => {
    const flat = new Array(200).fill(0);
    expect(estimateVibrato(flat, 31.25).rateHz).toBeNull();
  });

  it('recovers the rate and depth of a synthetic 5.5 Hz / ±50-cent contour', () => {
    const rate = 31.25;
    const contour = Array.from(
      { length: 250 },
      (_, i) => 50 * Math.sin((2 * Math.PI * 5.5 * i) / rate),
    );
    const vibrato = estimateVibrato(contour, rate);
    expect(vibrato.rateHz!).toBeCloseTo(5.5, 0);
    expect(vibrato.extentCents).toBeGreaterThan(60);
    expect(vibrato.extentCents).toBeLessThan(140);
  });
});

describe('detectOnsets', () => {
  const quiet = -65;
  const loud = -10;

  it('finds regular onsets and rates them near-metronomic', () => {
    // 8 bursts: quiet,loud,loud x8 → equal inter-onset intervals.
    const pattern: number[] = [];
    for (let i = 0; i < 8; i++) pattern.push(quiet, quiet, quiet, loud, loud, loud);
    const { onsetTimesS, regularity } = detectOnsets(framesWithDb(pattern));
    expect(onsetTimesS.length).toBe(8);
    expect(regularity).toBeGreaterThan(0.95);
  });

  it('rates erratic onset spacing near zero', () => {
    const pattern: number[] = [];
    // Wildly uneven quiet gaps; every gap is longer than the 150 ms refractory
    // window (~5 frames at 32 ms/hop) so each burst registers as its own onset.
    const gaps = [6, 30, 7, 40, 6, 25];
    for (const gap of gaps) {
      for (let i = 0; i < gap; i++) pattern.push(quiet);
      pattern.push(loud, loud);
    }
    const { regularity } = detectOnsets(framesWithDb(pattern));
    expect(regularity).toBeLessThan(0.2);
  });

  it('is neutral (0.5) when there are too few onsets to judge', () => {
    const { onsetTimesS, regularity } = detectOnsets(
      framesWithDb([quiet, loud, loud, loud, loud, loud]),
    );
    expect(onsetTimesS.length).toBe(1);
    expect(regularity).toBe(0.5);
  });
});

describe('extractFeatures', () => {
  it('measures a clean steady tone: tiny jitter, no vibrato, high SNR', () => {
    const features = extractFeatures(audio(concat(sine(220, 3), silence(0.7), noise(0.3, 0.001))));
    expect(features.pitchJitterCents).toBeLessThan(5);
    expect(features.vibratoRateHz).toBeNull();
    expect(features.snrDb).toBeGreaterThan(30);
    expect(features.clippingRate).toBe(0);
    expect(features.voicedRatio).toBeGreaterThan(0.5);
  });

  it('measures vibrato on a modulated tone', () => {
    const features = extractFeatures(audio(vibratoSine(220, 3, 5.5, 50)));
    expect(features.vibratoRateHz).not.toBeNull();
    expect(features.vibratoRateHz!).toBeCloseTo(5.5, 0);
    expect(features.vibratoExtentCents).toBeGreaterThan(40);
  });

  it('counts clipping on a full-scale signal', () => {
    const features = extractFeatures(audio(sine(220, 2.5, 1.0)));
    expect(features.clippingRate).toBeGreaterThan(0);
  });

  it('detects onset structure in a burst train', () => {
    const features = extractFeatures(audio(bursts(220, 6, 0.3, [0.25])));
    expect(features.onsetCount).toBeGreaterThanOrEqual(4);
    expect(features.onsetRegularity).toBeGreaterThan(0.7);
  });

  it('rejects recordings shorter than 2 seconds', () => {
    expect(() => extractFeatures(audio(sine(220, 1)))).toThrow(/at least 2 seconds/);
  });

  it('rejects recordings with no audible singing', () => {
    expect(() => extractFeatures(audio(noise(2.5, 0.2)))).toThrow(/audible singing/);
  });
});
