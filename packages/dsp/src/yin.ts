/**
 * YIN fundamental-frequency estimation (de Cheveigné & Kawahara, 2002) —
 * hand-rolled, dependency-free, deterministic. This is REAL signal analysis
 * (Hard Rule 6): the number it returns is measured from the waveform, never
 * guessed by a model.
 */

export interface YinOptions {
  /** Lowest detectable pitch. Default 70 Hz (below a bass singer's range floor). */
  readonly minFrequencyHz?: number;
  /** Highest detectable pitch. Default 1000 Hz (above soprano C6). */
  readonly maxFrequencyHz?: number;
  /** CMNDF aperiodicity threshold; frames with no dip below it are unvoiced. */
  readonly threshold?: number;
}

/**
 * Estimate the fundamental frequency of one analysis frame.
 * Returns null for unvoiced/silent frames.
 */
export function detectPitch(
  frame: Float32Array,
  sampleRate: number,
  options: YinOptions = {},
): number | null {
  const minF = options.minFrequencyHz ?? 70;
  const maxF = options.maxFrequencyHz ?? 1000;
  const threshold = options.threshold ?? 0.15;

  const tauMin = Math.max(2, Math.floor(sampleRate / maxF));
  const tauMax = Math.ceil(sampleRate / minF);
  if (tauMax >= Math.floor(frame.length / 2)) {
    throw new Error(`YIN: frame of ${frame.length} too short for minFrequencyHz=${minF}`);
  }

  // Difference function d(tau) over half the frame. Computed from tau = 1
  // (not tauMin): the cumulative mean below must include the small lags, or a
  // dip sitting exactly at tauMin normalizes to 1 and is missed (octave error
  // at the max-frequency boundary).
  const half = Math.floor(frame.length / 2);
  const diff = new Float64Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < half; i++) {
      const delta = frame[i]! - frame[i + tau]!;
      sum += delta * delta;
    }
    diff[tau] = sum;
  }

  // Cumulative-mean-normalized difference function (CMNDF).
  const cmndf = new Float64Array(tauMax + 1).fill(1);
  let cumulative = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    cumulative += diff[tau]!;
    cmndf[tau] = cumulative === 0 ? 1 : (diff[tau]! * tau) / cumulative;
  }

  // First dip under the threshold, refined to its local minimum.
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (cmndf[t]! < threshold) {
      while (t + 1 <= tauMax && cmndf[t + 1]! < cmndf[t]!) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return null; // unvoiced: no periodicity strong enough

  // Parabolic interpolation around the minimum for sub-sample precision.
  if (tau > tauMin && tau < tauMax) {
    const s0 = cmndf[tau - 1]!;
    const s1 = cmndf[tau]!;
    const s2 = cmndf[tau + 1]!;
    const denominator = 2 * (2 * s1 - s2 - s0);
    if (denominator !== 0) {
      const adjustment = (s2 - s0) / denominator;
      return sampleRate / (tau + adjustment);
    }
  }
  return sampleRate / tau;
}
