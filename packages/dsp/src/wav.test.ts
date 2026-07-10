import { describe, expect, it } from 'vitest';
import { encodeWav, parseWav } from './wav';
import { sine, SR } from './signals.test';

/** Hand-build a stereo 16-bit PCM WAV (encodeWav is mono-only). */
function stereoWav(left: number[], right: number[], sampleRate = SR): Uint8Array {
  const frames = left.length;
  const dataSize = frames * 4;
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < frames; i++) {
    view.setInt16(44 + i * 4, Math.round(left[i]! * 32767), true);
    view.setInt16(44 + i * 4 + 2, Math.round(right[i]! * 32767), true);
  }
  return bytes;
}

/** Mutate a field of a valid header to produce targeted corruption. */
function corrupt(mutate: (view: DataView, bytes: Uint8Array) => void): Uint8Array {
  const bytes = encodeWav(sine(440, 0.1), SR);
  mutate(new DataView(bytes.buffer), bytes);
  return bytes;
}

describe('parseWav', () => {
  it('roundtrips mono samples through encodeWav (16-bit precision)', () => {
    const original = sine(440, 0.25);
    const decoded = parseWav(encodeWav(original, SR));
    expect(decoded.sampleRate).toBe(SR);
    expect(decoded.samples.length).toBe(original.length);
    for (let i = 0; i < 50; i++) {
      expect(decoded.samples[i]!).toBeCloseTo(original[i]!, 3);
    }
  });

  it('clamps out-of-range samples when encoding', () => {
    const hot = new Float32Array([1.5, -1.5, 0]);
    const decoded = parseWav(encodeWav(hot, SR));
    expect(decoded.samples[0]!).toBeCloseTo(1, 3);
    expect(decoded.samples[1]!).toBeCloseTo(-1, 3);
  });

  it('averages stereo down to mono', () => {
    const bytes = stereoWav([0.5, 0.5], [-0.5, 0.5]);
    const decoded = parseWav(bytes);
    expect(decoded.samples[0]!).toBeCloseTo(0, 2); // (0.5 + -0.5) / 2
    expect(decoded.samples[1]!).toBeCloseTo(0.5, 2);
  });

  it('skips unknown chunks (including odd-sized ones needing pad bytes)', () => {
    // Build: RIFF header + junk chunk (odd size 3) + fmt + data.
    const base = encodeWav(sine(440, 0.05), SR);
    const fmtAndData = base.subarray(12); // 'fmt '... onwards
    const junk = new Uint8Array(8 + 4); // 'JUNK' + size 3 + 3 bytes + 1 pad
    junk.set([0x4a, 0x55, 0x4e, 0x4b]); // JUNK
    new DataView(junk.buffer).setUint32(4, 3, true);
    const out = new Uint8Array(12 + junk.length + fmtAndData.length);
    out.set(base.subarray(0, 12));
    out.set(junk, 12);
    out.set(fmtAndData, 12 + junk.length);
    new DataView(out.buffer).setUint32(4, out.length - 8, true);
    expect(parseWav(out).sampleRate).toBe(SR);
  });

  it('rejects files too small for a header', () => {
    expect(() => parseWav(new Uint8Array(10))).toThrow(/too small/);
  });

  it('rejects non-RIFF and non-WAVE files', () => {
    expect(() => parseWav(corrupt((_, b) => (b[0] = 0x58)))).toThrow(/RIFF/);
    expect(() => parseWav(corrupt((_, b) => (b[8] = 0x58)))).toThrow(/RIFF/);
  });

  it('rejects a missing fmt chunk', () => {
    // Rename 'fmt ' so the walker never finds it.
    expect(() => parseWav(corrupt((_, b) => (b[12] = 0x58)))).toThrow(/missing fmt/);
  });

  it('rejects a missing data chunk', () => {
    expect(() => parseWav(corrupt((_, b) => (b[36] = 0x58)))).toThrow(/missing data/);
  });

  it('rejects non-PCM encodings', () => {
    expect(() => parseWav(corrupt((v) => v.setUint16(20, 3, true)))).toThrow(/PCM/);
  });

  it('rejects non-16-bit samples', () => {
    expect(() => parseWav(corrupt((v) => v.setUint16(34, 24, true)))).toThrow(/16-bit/);
  });

  it('rejects channel counts other than 1 or 2', () => {
    expect(() => parseWav(corrupt((v) => v.setUint16(22, 6, true)))).toThrow(/channels/);
  });

  it('rejects implausible sample rates', () => {
    expect(() => parseWav(corrupt((v) => v.setUint32(24, 4000, true)))).toThrow(/sample rate/);
    expect(() => parseWav(corrupt((v) => v.setUint32(24, 400000, true)))).toThrow(/sample rate/);
  });

  it('tolerates a data chunk whose declared size overruns the file', () => {
    const decoded = parseWav(corrupt((v) => v.setUint32(40, 10_000_000, true)));
    expect(decoded.samples.length).toBeGreaterThan(0);
  });
});
