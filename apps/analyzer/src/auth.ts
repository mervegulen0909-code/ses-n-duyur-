import { createHmac, timingSafeEqual } from 'node:crypto';

export interface AnalysisUploadClaims {
  readonly version: 1;
  readonly sessionId: string;
  readonly userId: string;
  readonly performanceId: string;
  readonly nonce: string;
  readonly expiresAtEpochSeconds: number;
}

const hmacHex = (secret: string, value: string): string =>
  createHmac('sha256', secret).update(value).digest('hex');

function isClaims(value: unknown): value is AnalysisUploadClaims {
  if (!value || typeof value !== 'object') return false;
  const claims = value as Record<string, unknown>;
  return (
    claims.version === 1 &&
    typeof claims.sessionId === 'string' &&
    typeof claims.userId === 'string' &&
    typeof claims.performanceId === 'string' &&
    typeof claims.nonce === 'string' &&
    claims.nonce.length >= 32 &&
    typeof claims.expiresAtEpochSeconds === 'number' &&
    Number.isInteger(claims.expiresAtEpochSeconds)
  );
}

export function verifyAnalysisUploadToken(
  token: string,
  secret: string,
  nowEpochSeconds = Math.floor(Date.now() / 1000),
): AnalysisUploadClaims | null {
  if (secret.length < 32) return null;
  const [payload, supplied, extra] = token.split('.');
  if (!payload || !supplied || extra || !/^[a-f0-9]{64}$/.test(supplied)) return null;
  const expected = hmacHex(secret, payload);
  if (!timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(expected, 'hex'))) return null;

  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!isClaims(parsed) || parsed.expiresAtEpochSeconds <= nowEpochSeconds) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function signCallbackBody(body: string, secret: string, timestamp: string): string {
  if (secret.length < 32) throw new Error('callback secret must be at least 32 characters');
  return `sha256=${hmacHex(secret, `${timestamp}.${body}`)}`;
}
