import * as AppIntegrity from '@expo/app-integrity';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { WEB_BASE as API_BASE } from './config';
import { supabase } from './supabase';

const IOS_KEY_PREFIX = 'voxscore.app-attest-key.';
let androidProvider: Promise<void> | null = null;
let iosRegistration: Promise<string> | null = null;

function bytesToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function nativeRequestHash(
  method: string,
  path: string,
  rawBody: string | Uint8Array,
): Promise<string> {
  const prefix = new TextEncoder().encode(`${method.toUpperCase()}\n${path}\n`);
  const body = typeof rawBody === 'string' ? new TextEncoder().encode(rawBody) : rawBody;
  const input = new Uint8Array(prefix.length + body.length);
  input.set(prefix, 0);
  input.set(body, prefix.length);
  return bytesToHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, input));
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Authentication required for app attestation');
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

async function challenge(purpose: 'attestation' | 'assertion'): Promise<{
  challengeId: string;
  challenge: string;
}> {
  const response = await fetch(`${API_BASE}/api/attestation/challenge`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ purpose }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    challengeId?: string;
    challenge?: string;
  };
  if (!response.ok || !data.challengeId || !data.challenge) {
    throw new Error('Could not obtain app attestation challenge');
  }
  return { challengeId: data.challengeId, challenge: data.challenge };
}

async function ensureIosKey(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user.id) throw new Error('Authentication required for App Attest');
  const storageKey = `${IOS_KEY_PREFIX}${session.user.id}`;
  const existing = await SecureStore.getItemAsync(storageKey);
  if (existing) return existing;
  if (!AppIntegrity.isSupported) throw new Error('App Attest is not supported on this device');

  if (!iosRegistration) {
    iosRegistration = (async () => {
      const keyId = await AppIntegrity.generateKeyAsync();
      const issued = await challenge('attestation');
      const attestation = await AppIntegrity.attestKeyAsync(keyId, issued.challenge);
      const response = await fetch(`${API_BASE}/api/attestation/register`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          challengeId: issued.challengeId,
          keyId,
          attestation,
        }),
      });
      if (!response.ok) throw new Error('App Attest key registration failed');
      await SecureStore.setItemAsync(storageKey, keyId);
      return keyId;
    })().finally(() => {
      iosRegistration = null;
    });
  }
  return iosRegistration;
}

/**
 * Per-request proof for the server's bot guard. Android uses Play Integrity's
 * Standard request hash; iOS signs challenge+requestHash with an attested key.
 */
export async function getNativeIntegrityHeaders(
  path: string,
  method: string,
  rawBody: string | Uint8Array,
): Promise<Record<string, string>> {
  const requestHash = await nativeRequestHash(method, path, rawBody);

  if (Platform.OS === 'android') {
    const projectNumber = process.env.EXPO_PUBLIC_PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER;
    if (!projectNumber) throw new Error('Play Integrity project is not configured');
    androidProvider ??= AppIntegrity.prepareIntegrityTokenProviderAsync(projectNumber).catch(
      (error) => {
        androidProvider = null;
        throw error;
      },
    );
    await androidProvider;
    let integrityToken: string;
    try {
      integrityToken = await AppIntegrity.requestIntegrityCheckAsync(requestHash);
    } catch {
      // Providers expire. Prepare once more and retry exactly once.
      androidProvider = AppIntegrity.prepareIntegrityTokenProviderAsync(projectNumber);
      await androidProvider;
      integrityToken = await AppIntegrity.requestIntegrityCheckAsync(requestHash);
    }
    return {
      'x-voxscore-platform': 'android',
      'x-app-integrity-token': integrityToken,
    };
  }

  if (Platform.OS === 'ios') {
    const keyId = await ensureIosKey();
    const issued = await challenge('assertion');
    const clientData = JSON.stringify({ challenge: issued.challenge, requestHash });
    const assertion = await AppIntegrity.generateAssertionAsync(keyId, clientData);
    return {
      'x-voxscore-platform': 'ios',
      'x-app-attest-key-id': keyId,
      'x-app-attest-challenge-id': issued.challengeId,
      'x-app-attest-client-data': encodeURIComponent(clientData),
      'x-app-attest-assertion': assertion,
    };
  }

  throw new Error('Native app attestation is unavailable on this platform');
}
