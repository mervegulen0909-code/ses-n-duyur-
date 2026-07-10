import { describe, expect, it } from 'vitest';
import { detectPitch } from './yin';
import { noise, silence, sine, SR } from './signals.test';

const FRAME = 2048;

function frameOf(signal: Float32Array): Float32Array {
  return signal.subarray(0, FRAME);
}

describe('detectPitch (YIN)', () => {
  it('tracks a 440 Hz sine to within 1 Hz', () => {
    const f0 = detectPitch(frameOf(sine(440, 0.2)), SR);
    expect(f0).not.toBeNull();
    expect(f0!).toBeCloseTo(440, 0);
  });

  it('tracks a low male-voice pitch (100 Hz)', () => {
    const f0 = detectPitch(frameOf(sine(100, 0.2)), SR);
    expect(f0!).toBeCloseTo(100, 0);
  });

  it('tracks near the low boundary without parabolic interpolation (70 Hz)', () => {
    const f0 = detectPitch(frameOf(sine(70, 0.3)), SR, { minFrequencyHz: 70 });
    expect(f0).not.toBeNull();
    expect(f0!).toBeCloseTo(70, -1);
  });

  it('handles a pitch at the max-frequency boundary (tau = tauMin)', () => {
    const f0 = detectPitch(frameOf(sine(1000, 0.2)), SR, { maxFrequencyHz: 1000 });
    expect(f0).not.toBeNull();
    expect(f0!).toBeCloseTo(1000, -1);
  });

  it('returns null for silence (all-zero frame)', () => {
    expect(detectPitch(frameOf(silence(0.2)), SR)).toBeNull();
  });

  it('returns null for white noise (no periodicity)', () => {
    expect(detectPitch(frameOf(noise(0.2, 0.4)), SR)).toBeNull();
  });

  it('throws when the frame is too short for the requested pitch floor', () => {
    expect(() => detectPitch(new Float32Array(256), SR)).toThrow(/too short/);
  });

  it('is deterministic: identical frames give identical pitch', () => {
    const frame = frameOf(sine(330, 0.2));
    expect(detectPitch(frame, SR)).toBe(detectPitch(frame, SR));
  });
});
