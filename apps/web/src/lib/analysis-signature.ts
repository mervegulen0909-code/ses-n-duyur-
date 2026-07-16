import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface AnalysisUploadClaims {
  readonly version: 1;
  readonly sessionId: string;
  readonly userId: string;
  readonly performanceId: string;
  readonly nonce: string;
  readonly expiresAtEpochSeconds: number;
}

function hmacHex(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

function requireSecret(secret: string | undefined, name: string): string {
  if (!secret || secret.length < 32) throw new Error(`${name} must be at least 32 characters`);
  return secret;
}

export function newAnalysisNonce(): string {
  return randomBytes(32).toString('base64url');
}

export function signAnalysisUploadClaims(claims: AnalysisUploadClaims): string {
  const secret = requireSecret(process.env.ANALYZER_UPLOAD_SECRET, 'ANALYZER_UPLOAD_SECRET');
  const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  return `${payload}.${hmacHex(secret, payload)}`;
}

export function verifyAnalyzerCallbackSignature(
  body: string,
  timestampHeader: string | null,
  signatureHeader: string | null,
  nowEpochSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const secret = process.env.ANALYZER_CALLBACK_SECRET;
  if (!secret || secret.length < 32 || !timestampHeader || !signatureHeader) return false;
  if (!/^\d{10}$/.test(timestampHeader)) return false;
  const timestamp = Number(timestampHeader);
  if (Math.abs(nowEpochSeconds - timestamp) > 300) return false;
  const supplied = signatureHeader.startsWith('sha256=')
    ? signatureHeader.slice('sha256='.length)
    : '';
  if (!/^[a-f0-9]{64}$/.test(supplied)) return false;
  const expected = hmacHex(secret, `${timestampHeader}.${body}`);
  return timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(expected, 'hex'));
}
