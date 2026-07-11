import { describe, expect, it } from 'vitest';
import {
  MEASURED_CRITERIA,
  measureScores,
  measureWav,
  pitchControlScore,
  recordingQualityScore,
  spectralBalanceScore,
  timingSteadinessScore,
  vibratoControlScore,
} from './measure';
import { encodeWav } from './wav';
import type { VocalFeatures } from './features';
import { concat, silence, vibratoSine, SR } from './signals.test';

describe('score mappings (documented monotonic proxies)', () => {
  it('pitchControl: perfect = 100, 60¢ jitter = 0, clamped below', () => {
    expect(pitchControlScore(0)).toBe(100);
    expect(pitchControlScore(30)).toBe(50);
    expect(pitchControlScore(60)).toBe(0);
    expect(pitchControlScore(200)).toBe(0);
  });

  it('timingSteadiness maps regularity linearly', () => {
    expect(timingSteadinessScore(1)).toBe(100);
    expect(timingSteadinessScore(0.5)).toBe(50);
    expect(timingSteadinessScore(0)).toBe(0);
  });

  it('vibratoControl: absence is neutral, classical vibrato scores high', () => {
    expect(vibratoControlScore(null, 0)).toBe(50);
    expect(vibratoControlScore(6, 70)).toBe(100);
    expect(vibratoControlScore(2, 70)).toBe(50); // rate far off the band
    expect(vibratoControlScore(6, 170)).toBe(50); // extent out of control
  });

  it('recordingQuality: rewards SNR, penalizes clipping, clamps at 0', () => {
    expect(recordingQualityScore(40, 0)).toBe(100);
    expect(recordingQualityScore(5, 0)).toBe(0);
    expect(recordingQualityScore(40, 0.5)).toBe(40); // penalty capped at 60
    expect(recordingQualityScore(0, 1)).toBe(0); // bottom clamp
  });

  it('spectralBalance: peaks at the 2.2 kHz presence region, falls off linearly (T12)', () => {
    expect(spectralBalanceScore(2200)).toBe(100);
    expect(spectralBalanceScore(1100)).toBe(50);
    expect(spectralBalanceScore(3300)).toBe(50);
    expect(spectralBalanceScore(4400)).toBe(0);
    expect(spectralBalanceScore(6600)).toBe(0); // clamped past one span
  });

  it('measureScores composes the four mappings', () => {
    const features: VocalFeatures = {
      durationS: 30,
      voicedRatio: 0.8,
      pitchJitterCents: 6,
      vibratoRateHz: 6,
      vibratoExtentCents: 70,
      dynamicRangeDb: 12,
      snrDb: 40,
      clippingRate: 0,
      onsetRegularity: 0.9,
      onsetCount: 12,
      spectralCentroidHz: 2200,
    };
    expect(measureScores(features)).toEqual({
      pitchControl: 90,
      timingSteadiness: 90,
      vibratoControl: 100,
      recordingQuality: 100,
      spectralBalance: 100,
    });
  });

  it('maps only objective criteria (Hard Rule 6 split)', () => {
    expect(Object.keys(MEASURED_CRITERIA)).toEqual([
      'vocalAccuracy',
      'rhythmTiming',
      'technicalSkill',
      'recordingQuality',
      'toneQuality',
    ]);
  });
});

describe('measureWav end-to-end', () => {
  const takeBytes = () => encodeWav(concat(vibratoSine(220, 3, 5.5, 50), silence(0.7)), SR);

  it('produces sane measured scores for a synthetic vocal take', () => {
    const { features, scores } = measureWav(takeBytes());
    expect(features.vibratoRateHz).not.toBeNull();
    expect(scores.pitchControl).toBeGreaterThan(50);
    expect(scores.vibratoControl).toBeGreaterThan(50);
    expect(scores.recordingQuality).toBeGreaterThan(60);
    for (const value of Object.values(scores)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('is fully deterministic: same bytes, identical measurement', () => {
    expect(measureWav(takeBytes())).toEqual(measureWav(takeBytes()));
  });

  it('propagates parse errors for non-WAV input', () => {
    expect(() => measureWav(new Uint8Array([1, 2, 3]))).toThrow(/too small/);
  });
});
