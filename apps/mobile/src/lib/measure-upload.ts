import { File } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';

import { NATIVE_CLIENT_HEADERS } from './api';
import { getNativeIntegrityHeaders } from './attestation';
import { WEB_BASE as API_BASE } from './config';
import { supabase } from './supabase';

// Server cap (Vercel request-body limit, see /api/measurements): at the
// recorder's 16 kHz mono 16-bit this is ~2 minutes of audio.
export const MAX_WAV_BYTES = 4 * 1024 * 1024;

export type MeasurementResult = {
  ok: boolean;
  status: number;
  /** Criterion-keyed 0-100 measured sub-scores (the 4 objective criteria). */
  breakdown?: Record<string, number>;
  error?: string;
};

/**
 * Upload the recorded WAV for measurement (ADR 0003 "measure and delete").
 *
 * Lives apart from api.ts on purpose: it imports expo-file-system + expo/fetch
 * (native), which the JSON api client — and its node test suite — must not
 * pull in. Uses expo/fetch because React Native's global fetch cannot stream a
 * file as a raw binary body; the File class implements Blob.
 *
 * The caller deletes the local file afterwards — the recording should not
 * outlive the measurement on the device either.
 */
export async function uploadMeasurement(
  performanceId: string,
  fileUri: string,
): Promise<MeasurementResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const file = new File(fileUri);
  if ((file.size ?? 0) > MAX_WAV_BYTES) {
    return {
      ok: false,
      status: 413,
      error: 'Recording too long — keep the measurement take under 2 minutes.',
    };
  }

  try {
    const path = `/api/measurements?performanceId=${encodeURIComponent(performanceId)}`;
    const integrityHeaders =
      process.env.EXPO_PUBLIC_NATIVE_ATTESTATION_ENABLED === 'true'
        ? await getNativeIntegrityHeaders(path, 'POST', new Uint8Array(await file.arrayBuffer()))
        : {};
    const res = await expoFetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'audio/wav',
        ...NATIVE_CLIENT_HEADERS,
        ...integrityHeaders,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: file,
    });
    const json = (await res.json().catch(() => ({}))) as {
      breakdown?: Record<string, number>;
      error?: string;
    };
    return { ok: res.ok, status: res.status, breakdown: json.breakdown, error: json.error };
  } catch {
    return { ok: false, status: 0, error: 'Network error — check your connection and try again.' };
  }
}
