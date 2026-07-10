import { describe, expect, it } from 'vitest';

/**
 * Deterministic synthetic-signal generators shared by the DSP tests. Living in
 * a .test.ts file keeps them out of the coverage denominator while letting
 * every suite import them.
 */

export const SR = 16000;

export function sine(freqHz: number, seconds: number, amp = 0.5, sr = SR): Float32Array {
  const out = new Float32Array(Math.round(seconds * sr));
  for (let i = 0; i < out.length; i++) out[i] = amp * Math.sin((2 * Math.PI * freqHz * i) / sr);
  return out;
}

/** Sine with sinusoidal pitch modulation (vibrato) via phase accumulation. */
export function vibratoSine(
  freqHz: number,
  seconds: number,
  rateHz: number,
  depthCents: number,
  amp = 0.5,
  sr = SR,
): Float32Array {
  const out = new Float32Array(Math.round(seconds * sr));
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    const instantaneous =
      freqHz * Math.pow(2, (depthCents * Math.sin(2 * Math.PI * rateHz * t)) / 1200);
    phase += (2 * Math.PI * instantaneous) / sr;
    out[i] = amp * Math.sin(phase);
  }
  return out;
}

export function silence(seconds: number, sr = SR): Float32Array {
  return new Float32Array(Math.round(seconds * sr));
}

/** Deterministic white noise (mulberry32 PRNG — no Math.random). */
export function noise(seconds: number, amp = 0.3, seed = 42, sr = SR): Float32Array {
  let state = seed >>> 0;
  const rand = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
  const out = new Float32Array(Math.round(seconds * sr));
  for (let i = 0; i < out.length; i++) out[i] = amp * rand();
  return out;
}

export function concat(...parts: Float32Array[]): Float32Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** Tone bursts separated by silence — a synthetic "note onset" train. */
export function bursts(
  freqHz: number,
  count: number,
  burstS: number,
  gaps: readonly number[],
  amp = 0.5,
  sr = SR,
): Float32Array {
  const parts: Float32Array[] = [silence(0.3, sr)];
  for (let i = 0; i < count; i++) {
    parts.push(sine(freqHz, burstS, amp, sr));
    parts.push(silence(gaps[i % gaps.length]!, sr));
  }
  return concat(...parts);
}

describe('synthetic signal generators', () => {
  it('sine oscillates at the requested frequency (zero-crossing check)', () => {
    const s = sine(100, 1);
    let crossings = 0;
    for (let i = 1; i < s.length; i++) {
      if ((s[i - 1]! < 0 && s[i]! >= 0) || (s[i - 1]! >= 0 && s[i]! < 0)) crossings++;
    }
    expect(crossings / 2).toBeCloseTo(100, -1); // ~100 cycles in 1 s
  });

  it('noise is deterministic for a fixed seed', () => {
    expect(noise(0.1, 0.3, 7)).toEqual(noise(0.1, 0.3, 7));
  });
});
