import 'server-only';

import { createHash, timingSafeEqual } from 'node:crypto';
import { GoogleAuth } from 'google-auth-library';
import { verifyAssertion, verifyAttestation } from 'appattest-checker-node';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

const ANDROID_PACKAGE = process.env.GOOGLE_PLAY_PACKAGE_NAME ?? 'com.voxscore.app';
const IOS_BUNDLE = process.env.APPLE_BUNDLE_ID ?? 'com.voxscore.app';
const MAX_VERDICT_AGE_MS = 2 * 60_000;

interface PlayIntegrityPayload {
  requestDetails?: {
    requestPackageName?: string;
    requestHash?: string;
    timestampMillis?: string;
  };
  appIntegrity?: {
    appRecognitionVerdict?: string;
    packageName?: string;
    certificateSha256Digest?: string[];
  };
  deviceIntegrity?: { deviceRecognitionVerdict?: string[] };
  accountDetails?: { appLicensingVerdict?: string };
}

function sameString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Hash exactly what the native client sends: method, path+query, raw body. */
export async function nativeRequestHash(
  req: Request,
  rawBody?: string | Uint8Array,
): Promise<string> {
  const url = new URL(req.url);
  const body =
    typeof rawBody === 'string'
      ? Buffer.from(rawBody)
      : rawBody
        ? Buffer.from(rawBody)
        : Buffer.from(await req.clone().arrayBuffer());
  return createHash('sha256')
    .update(req.method.toUpperCase())
    .update('\n')
    .update(`${url.pathname}${url.search}`)
    .update('\n')
    .update(body)
    .digest('hex');
}

function googleCredentials(): Record<string, unknown> | null {
  const encoded = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64;
  if (!encoded) return null;
  try {
    return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function verifyAndroid(req: Request, rawBody?: string | Uint8Array): Promise<boolean> {
  const token = req.headers.get('x-app-integrity-token');
  const credentials = googleCredentials();
  const allowedCertificates = new Set(
    (process.env.GOOGLE_PLAY_CERT_SHA256 ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  if (!token || !credentials || allowedCertificates.size === 0) return false;

  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/playintegrity'],
  });
  const accessToken = await auth.getAccessToken();
  if (!accessToken) return false;

  const response = await fetch(
    `https://playintegrity.googleapis.com/v1/${ANDROID_PACKAGE}:decodeIntegrityToken`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ integrity_token: token }),
      signal: AbortSignal.timeout(8_000),
    },
  );
  if (!response.ok) return false;
  const decoded = (await response.json()) as { tokenPayloadExternal?: PlayIntegrityPayload };
  const payload = decoded.tokenPayloadExternal;
  if (!payload) return false;

  const expectedHash = await nativeRequestHash(req, rawBody);
  const timestamp = Number(payload.requestDetails?.timestampMillis ?? 0);
  const certificates = payload.appIntegrity?.certificateSha256Digest ?? [];
  return (
    payload.requestDetails?.requestPackageName === ANDROID_PACKAGE &&
    payload.appIntegrity?.packageName === ANDROID_PACKAGE &&
    payload.requestDetails.requestHash === expectedHash &&
    Number.isFinite(timestamp) &&
    Math.abs(Date.now() - timestamp) <= MAX_VERDICT_AGE_MS &&
    payload.appIntegrity.appRecognitionVerdict === 'PLAY_RECOGNIZED' &&
    certificates.some((digest) => allowedCertificates.has(digest)) &&
    (payload.deviceIntegrity?.deviceRecognitionVerdict ?? []).includes('MEETS_DEVICE_INTEGRITY') &&
    payload.accountDetails?.appLicensingVerdict === 'LICENSED'
  );
}

async function consumeIosChallenge(
  challengeId: string,
  userId: string,
  purpose: 'attestation' | 'assertion',
): Promise<string | null> {
  const service = createSupabaseServiceClient();
  if (!service) return null;
  const { data, error } = await service
    .from('attestation_challenges')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', challengeId)
    .eq('user_id', userId)
    .eq('purpose', purpose)
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('challenge')
    .maybeSingle();
  return error ? null : (data?.challenge ?? null);
}

async function verifyIos(
  req: Request,
  userId: string,
  rawBody?: string | Uint8Array,
): Promise<boolean> {
  const keyId = req.headers.get('x-app-attest-key-id');
  const challengeId = req.headers.get('x-app-attest-challenge-id');
  const encodedClientData = req.headers.get('x-app-attest-client-data');
  const encodedAssertion = req.headers.get('x-app-attest-assertion');
  if (!keyId || !challengeId || !encodedClientData || !encodedAssertion) return false;
  if (keyId.length > 256 || encodedClientData.length > 2048 || encodedAssertion.length > 8192) {
    return false;
  }

  const challenge = await consumeIosChallenge(challengeId, userId, 'assertion');
  if (!challenge) return false;

  const service = createSupabaseServiceClient();
  if (!service) return false;
  const { data: attestation } = await service
    .from('native_attestations')
    .select('public_key_pem, sign_count')
    .eq('key_id', keyId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!attestation) return false;

  let clientDataBytes: Buffer;
  let clientData: { challenge?: string; requestHash?: string };
  try {
    clientDataBytes = Buffer.from(decodeURIComponent(encodedClientData), 'utf8');
    clientData = JSON.parse(clientDataBytes.toString('utf8')) as {
      challenge?: string;
      requestHash?: string;
    };
  } catch {
    return false;
  }
  const expectedHash = await nativeRequestHash(req, rawBody);
  if (
    !clientData.challenge ||
    !clientData.requestHash ||
    !sameString(clientData.challenge, challenge) ||
    !sameString(clientData.requestHash, expectedHash)
  ) {
    return false;
  }

  const result = await verifyAssertion(
    createHash('sha256').update(clientDataBytes).digest(),
    attestation.public_key_pem,
    `${process.env.APPLE_TEAM_ID ?? ''}.${IOS_BUNDLE}`,
    Buffer.from(encodedAssertion, 'base64'),
  );
  if ('verifyError' in result || result.signCount <= Number(attestation.sign_count)) return false;

  const { data: advanced, error } = await service.rpc('advance_app_attest_counter', {
    p_key_id: keyId,
    p_user_id: userId,
    p_new_counter: result.signCount,
  });
  return !error && advanced === true;
}

export async function verifyNativeRequest(
  req: Request,
  userId: string,
  rawBody?: string | Uint8Array,
): Promise<boolean> {
  try {
    const platform = req.headers.get('x-voxscore-platform');
    if (platform === 'android') return await verifyAndroid(req, rawBody);
    if (platform === 'ios') return await verifyIos(req, userId, rawBody);
    return false;
  } catch (error) {
    console.error('[native-attestation] verification failed', {
      kind: error instanceof Error ? error.name : 'unknown',
    });
    return false;
  }
}

export async function registerIosAttestation(input: {
  userId: string;
  challengeId: string;
  keyId: string;
  attestation: string;
}): Promise<boolean> {
  try {
    const teamId = process.env.APPLE_TEAM_ID;
    if (!teamId) return false;
    const challenge = await consumeIosChallenge(input.challengeId, input.userId, 'attestation');
    if (!challenge) return false;

    const result = await verifyAttestation(
      {
        appId: `${teamId}.${IOS_BUNDLE}`,
        developmentEnv: process.env.APP_ATTEST_ENVIRONMENT === 'development',
      },
      input.keyId,
      Buffer.from(challenge, 'utf8'),
      Buffer.from(input.attestation, 'base64'),
    );
    if ('verifyError' in result) return false;

    const service = createSupabaseServiceClient();
    if (!service) return false;
    const { error } = await service.from('native_attestations').insert({
      key_id: input.keyId,
      user_id: input.userId,
      platform: 'ios',
      public_key_pem: result.publicKeyPem,
      receipt_base64: result.receipt.toString('base64'),
      sign_count: 0,
    });
    return !error;
  } catch (error) {
    console.error('[native-attestation] registration failed', {
      kind: error instanceof Error ? error.name : 'unknown',
    });
    return false;
  }
}
