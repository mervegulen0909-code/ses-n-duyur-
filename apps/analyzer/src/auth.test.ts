import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signCallbackBody, verifyAnalysisUploadToken } from './auth';

const secret = 'x'.repeat(32);

function token(payload: object): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(encoded).digest('hex');
  return `${encoded}.${signature}`;
}

describe('Analyzer auth', () => {
  const claims = {
    version: 1,
    sessionId: 'session',
    userId: 'user',
    performanceId: 'performance',
    nonce: 'n'.repeat(32),
    expiresAtEpochSeconds: 2_000_000_000,
  } as const;

  it('accepts a valid unexpired upload token', () => {
    expect(verifyAnalysisUploadToken(token(claims), secret, 1_999_999_999)).toEqual(claims);
  });

  it('rejects tampering, expiry, malformed claims, and weak secrets', () => {
    expect(verifyAnalysisUploadToken(`${token(claims)}x`, secret)).toBeNull();
    expect(verifyAnalysisUploadToken(token(claims), secret, 2_000_000_000)).toBeNull();
    expect(verifyAnalysisUploadToken(token({ ...claims, nonce: 'short' }), secret)).toBeNull();
    expect(verifyAnalysisUploadToken(token(claims), 'short')).toBeNull();
    expect(verifyAnalysisUploadToken('bad', secret)).toBeNull();
  });

  it('signs callback bodies with timestamp binding', () => {
    const expected = createHmac('sha256', secret).update('1234.{}').digest('hex');
    expect(signCallbackBody('{}', secret, '1234')).toBe(`sha256=${expected}`);
    expect(() => signCallbackBody('{}', 'short', '1234')).toThrow(/32 characters/);
  });
});
