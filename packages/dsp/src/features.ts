/**
 * Vocal feature extraction — every number here is measured from the waveform
 * with deterministic math (no models, no sampling). Same file in → same
 * numbers out, every time.
 */

import { detectPitch, type YinOptions } from './yin';
import type { WavAudio } from './wav';

export interface FrameAnalysis {
  readonly timeS: number;
  /** Fundamental frequency, or null when the frame is unvoiced/silent. */
  readonly f0Hz: number | null;
  readonly rmsDb: number;
}

export interface VocalFeatures {
  readonly durationS: number;
  /** Share of frames with a detectable pitch (0..1). */
  readonly voicedRatio: number;
  /** Median frame-to-frame pitch movement, in cents — micro-instability. */
  readonly pitchJitterCents: number;
  /** Vibrato modulation rate, or null when no vibrato is present. */
  readonly vibratoRateHz: number | null;
  /** Approximate peak-to-peak vibrato depth in cents (0 when none). */
  readonly vibratoExtentCents: number;
  /** Loudness range of the voiced performance (p90 − p10 of frame RMS, dB). */
  readonly dynamicRangeDb: number;
  /** Voiced-signal level over the noise floor, in dB. */
  readonly snrDb: number;
  /** Share of samples at digital full scale (0..1). */
  readonly clippingRate: number;
  /** Regularity of note onsets (1 = metronomic, 0 = erratic). */
  readonly onsetRegularity: number;
  readonly onsetCount: number;
}

export interface AnalysisOptions extends YinOptions {
  readonly frameSize?: number;
  readonly hopSize?: number;
}

const SILENCE_FLOOR_DB = -70;

function rmsDbOf(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i]! * frame[i]!;
  const rms = Math.sqrt(sum / frame.length);
  return rms <= 0 ? SILENCE_FLOOR_DB : Math.max(SILENCE_FLOOR_DB, 20 * Math.log10(rms));
}

/** Sorted-copy percentile with linear interpolation; p in [0, 1]. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) throw new Error('percentile: empty input');
  const sorted = [...values].sort((a, b) => a - b);
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const frac = idx - lo;
  return sorted[lo]! * (1 - frac) + sorted[hi]! * frac;
}

export function median(values: readonly number[]): number {
  return percentile(values, 0.5);
}

export function centsBetween(f1: number, f2: number): number {
  return 1200 * Math.log2(f2 / f1);
}

/** Slice the audio into analysis frames and pitch-track each one. */
export function analyzeFrames(audio: WavAudio, options: AnalysisOptions = {}): FrameAnalysis[] {
  const frameSize = options.frameSize ?? 2048;
  const hopSize = options.hopSize ?? 512;
  const frames: FrameAnalysis[] = [];
  for (let start = 0; start + frameSize <= audio.samples.length; start += hopSize) {
    const frame = audio.samples.subarray(start, start + frameSize);
    const rmsDb = rmsDbOf(frame);
    // Silent frames are never voiced — skip the (comparatively) costly YIN pass.
    const f0Hz =
      rmsDb <= SILENCE_FLOOR_DB + 10 ? null : detectPitch(frame, audio.sampleRate, options);
    frames.push({ timeS: start / audio.sampleRate, f0Hz, rmsDb });
  }
  return frames;
}

/** Moving average with a centered window (window length in items, >= 1). */
export function movingAverage(values: readonly number[], window: number): number[] {
  const half = Math.floor(window / 2);
  return values.map((_, i) => {
    const from = Math.max(0, i - half);
    const to = Math.min(values.length - 1, i + half);
    let sum = 0;
    for (let j = from; j <= to; j++) sum += values[j]!;
    return sum / (to - from + 1);
  });
}

interface VibratoEstimate {
  readonly rateHz: number | null;
  readonly extentCents: number;
}

/**
 * Vibrato from the voiced pitch contour: detrend with a ~400 ms moving average
 * (removes the melody), then read the residual's strength (extent) and its
 * oscillation rate (zero crossings). Below 8 cents of residual there is no
 * audible vibrato — report none.
 */
export function estimateVibrato(
  centsContour: readonly number[],
  contourRateHz: number,
): VibratoEstimate {
  if (centsContour.length < Math.round(contourRateHz)) {
    return { rateHz: null, extentCents: 0 }; // under a second of voiced pitch
  }
  const trend = movingAverage(centsContour, Math.round(contourRateHz * 0.4));
  const residual = centsContour.map((c, i) => c - trend[i]!);
  const rms = Math.sqrt(residual.reduce((sum, r) => sum + r * r, 0) / residual.length);
  const extentCents = rms * 2 * Math.SQRT2; // sine peak-to-peak from RMS
  if (extentCents < 8) return { rateHz: null, extentCents: 0 };

  let crossings = 0;
  for (let i = 1; i < residual.length; i++) {
    if (
      (residual[i - 1]! < 0 && residual[i]! >= 0) ||
      (residual[i - 1]! >= 0 && residual[i]! < 0)
    ) {
      crossings++;
    }
  }
  const seconds = residual.length / contourRateHz;
  return { rateHz: crossings / 2 / seconds, extentCents };
}

/**
 * Note onsets from RMS flux: a frame that jumps >= 6 dB over the previous one,
 * lands above the audible floor, and is outside a 150 ms refractory window.
 * Regularity is 1 − normalized spread of the inter-onset intervals.
 */
export function detectOnsets(frames: readonly FrameAnalysis[]): {
  onsetTimesS: number[];
  regularity: number;
} {
  const onsetTimesS: number[] = [];
  let lastOnset = -Infinity;
  for (let i = 1; i < frames.length; i++) {
    const rise = frames[i]!.rmsDb - frames[i - 1]!.rmsDb;
    const audible = frames[i]!.rmsDb > SILENCE_FLOOR_DB + 20;
    if (rise >= 6 && audible && frames[i]!.timeS - lastOnset >= 0.15) {
      onsetTimesS.push(frames[i]!.timeS);
      lastOnset = frames[i]!.timeS;
    }
  }

  if (onsetTimesS.length < 4) {
    // Too few events to judge timing — neutral, not a verdict.
    return { onsetTimesS, regularity: 0.5 };
  }
  const intervals = onsetTimesS.slice(1).map((t, i) => t - onsetTimesS[i]!);
  const spread = percentile(intervals, 0.75) - percentile(intervals, 0.25);
  const normalized = spread / median(intervals);
  return { onsetTimesS, regularity: Math.max(0, Math.min(1, 1 - normalized)) };
}

/** Extract the full measured feature set from a decoded recording. */
export function extractFeatures(audio: WavAudio, options: AnalysisOptions = {}): VocalFeatures {
  const durationS = audio.samples.length / audio.sampleRate;
  if (durationS < 2) throw new Error('measurement requires at least 2 seconds of audio');

  const hopSize = options.hopSize ?? 512;
  const frames = analyzeFrames(audio, options);
  const voiced = frames.filter((f) => f.f0Hz !== null);
  const voicedRatio = voiced.length / frames.length;
  if (voiced.length < 8) {
    throw new Error('measurement requires audible singing (too few voiced frames)');
  }

  // Pitch micro-instability: median |cents delta| between consecutive voiced frames.
  const deltas: number[] = [];
  for (let i = 1; i < voiced.length; i++) {
    deltas.push(Math.abs(centsBetween(voiced[i - 1]!.f0Hz!, voiced[i]!.f0Hz!)));
  }
  const pitchJitterCents = median(deltas);

  const contourRateHz = audio.sampleRate / hopSize;
  const referenceHz = voiced[0]!.f0Hz!;
  const centsContour = voiced.map((f) => centsBetween(referenceHz, f.f0Hz!));
  const vibrato = estimateVibrato(centsContour, contourRateHz);

  const voicedDb = voiced.map((f) => f.rmsDb);
  const allDb = frames.map((f) => f.rmsDb);
  const dynamicRangeDb = percentile(voicedDb, 0.9) - percentile(voicedDb, 0.1);
  const snrDb = percentile(voicedDb, 0.9) - percentile(allDb, 0.1);

  let clipped = 0;
  for (let i = 0; i < audio.samples.length; i++) {
    if (Math.abs(audio.samples[i]!) >= 0.999) clipped++;
  }
  const clippingRate = clipped / audio.samples.length;

  const onsets = detectOnsets(frames);

  return {
    durationS,
    voicedRatio,
    pitchJitterCents,
    vibratoRateHz: vibrato.rateHz,
    vibratoExtentCents: vibrato.extentCents,
    dynamicRangeDb,
    snrDb,
    clippingRate,
    onsetRegularity: onsets.regularity,
    onsetCount: onsets.onsetTimesS.length,
  };
}
