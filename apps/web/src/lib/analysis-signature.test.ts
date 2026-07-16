import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  newAnalysisNonce,
  signAnalysisUploadClaims,
  verifyAnalyzerCallbackSignature,
} from './analysis-signature';

const secret = 's'.repeat(32);

describe('analysis signatures', () => {
  beforeEach(() => {
    process.env.ANALYZER_UPLOAD_SECRET = secret;
    process.env.ANALYZER_CALLBACK_SECRET = secret;
  });

  it('creates a random nonce and signs upload claims without exposing the secret', () => {
    const nonce = newAnalysisNonce();
    const token = signAnalysisUploadClaims({
      version: 1,
      sessionId: 'session',
      userId: 'user',
      performanceId: 'performance',
      nonce,
      expiresAtEpochSeconds: 2_000_000_000,
    });
    expect(nonce.length).toBeGreaterThan(32);
    expect(token.split('.')).toHaveLength(2);
    expect(token).not.toContain(secret);
  });

  it('verifies only fresh, well-formed callback signatures', () => {
    const body = '{"ok":true}';
    const timestamp = '2000000000';
    const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
    expect(
      verifyAnalyzerCallbackSignature(body, timestamp, `sha256=${signature}`, 2_000_000_100),
    ).toBe(true);
    expect(
      verifyAnalyzerCallbackSignature(`${body}x`, timestamp, `sha256=${signature}`, 2_000_000_100),
    ).toBe(false);
    expect(
      verifyAnalyzerCallbackSignature(body, timestamp, `sha256=${signature}`, 2_000_000_400),
    ).toBe(false);
    expect(verifyAnalyzerCallbackSignature(body, null, null)).toBe(false);
  });

  it('fails closed when secrets are missing or too short', () => {
    process.env.ANALYZER_UPLOAD_SECRET = 'short';
    expect(() =>
      signAnalysisUploadClaims({
        version: 1,
        sessionId: 's',
        userId: 'u',
        performanceId: 'p',
        nonce: 'n',
        expiresAtEpochSeconds: 1,
      }),
    ).toThrow(/32 characters/);
    delete process.env.ANALYZER_CALLBACK_SECRET;
    expect(verifyAnalyzerCallbackSignature('{}', '2000000000', `sha256=${'0'.repeat(64)}`)).toBe(
      false,
    );
  });
});
