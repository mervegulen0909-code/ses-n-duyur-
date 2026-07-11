import { afterEach, describe, expect, it } from 'vitest';

import { clientIpFrom, hashIp, ipHashFromRequest } from './ip-hash';

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/listens/start', { headers });
}

describe('hashIp', () => {
  it('is deterministic: same ip + same salt → same 64-char hex hash', () => {
    const a = hashIp('203.0.113.7', 'pepper');
    const b = hashIp('203.0.113.7', 'pepper');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('a different salt produces a different hash for the same ip', () => {
    expect(hashIp('203.0.113.7', 'pepper')).not.toBe(hashIp('203.0.113.7', 'other-salt'));
  });

  it('a different ip produces a different hash under the same salt', () => {
    expect(hashIp('203.0.113.7', 'pepper')).not.toBe(hashIp('203.0.113.8', 'pepper'));
  });
});

describe('clientIpFrom', () => {
  it('takes the FIRST x-forwarded-for hop (the client), trimming whitespace', () => {
    const req = makeRequest({ 'x-forwarded-for': ' 203.0.113.7 , 10.0.0.1, 10.0.0.2' });
    expect(clientIpFrom(req)).toBe('203.0.113.7');
  });

  it('returns null when the header is absent or empty', () => {
    expect(clientIpFrom(makeRequest())).toBeNull();
    expect(clientIpFrom(makeRequest({ 'x-forwarded-for': '  ' }))).toBeNull();
  });
});

describe('ipHashFromRequest', () => {
  afterEach(() => {
    delete process.env.ANTI_ABUSE_SALT;
  });

  it('hashes the first forwarded hop with ANTI_ABUSE_SALT', () => {
    process.env.ANTI_ABUSE_SALT = 'pepper';
    const req = makeRequest({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' });
    expect(ipHashFromRequest(req)).toBe(hashIp('203.0.113.7', 'pepper'));
  });

  it('returns null when the forwarded header is missing', () => {
    process.env.ANTI_ABUSE_SALT = 'pepper';
    expect(ipHashFromRequest(makeRequest())).toBeNull();
  });

  it('returns null when ANTI_ABUSE_SALT is unset — never hash unsalted', () => {
    const req = makeRequest({ 'x-forwarded-for': '203.0.113.7' });
    expect(ipHashFromRequest(req)).toBeNull();
  });
});
