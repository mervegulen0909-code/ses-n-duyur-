/**
 * Minimal, dependency-free WAV (RIFF) reader for the measurement pipeline.
 *
 * Scope is deliberately narrow (ADR 0003): the in-app recorder submits
 * uncompressed 16-bit PCM WAV, mono or stereo. Anything else is rejected
 * loudly — a measurement must never silently run on misparsed audio.
 */

export interface WavAudio {
  readonly sampleRate: number;
  /** Mono samples in [-1, 1] (stereo inputs are averaged down). */
  readonly samples: Float32Array;
}

function ascii(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset]!,
    bytes[offset + 1]!,
    bytes[offset + 2]!,
    bytes[offset + 3]!,
  );
}

/** Parse a 16-bit PCM WAV file. Throws a descriptive error on anything else. */
export function parseWav(bytes: Uint8Array): WavAudio {
  if (bytes.length < 44) throw new Error('WAV: file too small to contain a header');
  if (ascii(bytes, 0) !== 'RIFF' || ascii(bytes, 8) !== 'WAVE') {
    throw new Error('WAV: not a RIFF/WAVE file');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Walk chunks: [id:4][size:4le][payload:size (padded to even)].
  let fmt: { channels: number; sampleRate: number; bitsPerSample: number; format: number } | null =
    null;
  let dataOffset = -1;
  let dataSize = 0;

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = ascii(bytes, offset);
    const size = view.getUint32(offset + 4, true);
    const payload = offset + 8;
    if (id === 'fmt ' && size >= 16) {
      fmt = {
        format: view.getUint16(payload, true),
        channels: view.getUint16(payload + 2, true),
        sampleRate: view.getUint32(payload + 4, true),
        bitsPerSample: view.getUint16(payload + 14, true),
      };
    } else if (id === 'data') {
      dataOffset = payload;
      dataSize = Math.min(size, bytes.length - payload);
    }
    offset = payload + size + (size % 2); // chunks are word-aligned
  }

  if (!fmt) throw new Error('WAV: missing fmt chunk');
  if (dataOffset < 0) throw new Error('WAV: missing data chunk');
  if (fmt.format !== 1) throw new Error(`WAV: only PCM (format 1) is supported, got ${fmt.format}`);
  if (fmt.bitsPerSample !== 16) {
    throw new Error(`WAV: only 16-bit samples are supported, got ${fmt.bitsPerSample}`);
  }
  if (fmt.channels !== 1 && fmt.channels !== 2) {
    throw new Error(`WAV: only mono/stereo supported, got ${fmt.channels} channels`);
  }
  if (fmt.sampleRate < 8000 || fmt.sampleRate > 192000) {
    throw new Error(`WAV: implausible sample rate ${fmt.sampleRate}`);
  }

  const frameCount = Math.floor(dataSize / (2 * fmt.channels));
  const samples = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    if (fmt.channels === 1) {
      samples[i] = view.getInt16(dataOffset + i * 2, true) / 32768;
    } else {
      const l = view.getInt16(dataOffset + i * 4, true);
      const r = view.getInt16(dataOffset + i * 4 + 2, true);
      samples[i] = (l + r) / 2 / 32768;
    }
  }

  return { sampleRate: fmt.sampleRate, samples };
}

/** Encode mono float samples as a 16-bit PCM WAV (used by tests and tooling). */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataSize = samples.length * 2;
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
  };
  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(44 + i * 2, Math.round(clamped * 32767), true);
  }
  return bytes;
}
