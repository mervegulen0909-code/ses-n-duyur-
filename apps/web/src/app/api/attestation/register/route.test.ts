import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getRequestContext: vi.fn() }));
vi.mock('@/lib/guard', () => ({ rateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/native-attestation', () => ({ registerIosAttestation: vi.fn() }));

import { getRequestContext } from '@/lib/supabase/server';
import { registerIosAttestation } from '@/lib/native-attestation';
import { POST } from './route';

const VALID = {
  challengeId: '11111111-1111-1111-1111-111111111111',
  keyId: 'a'.repeat(43),
  attestation: 'b'.repeat(100),
};

function request(body: unknown): Request {
  return new Request('http://localhost/api/attestation/register', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/attestation/register', () => {
  afterEach(() => vi.clearAllMocks());

  it('requires auth and valid input', async () => {
    expect((await POST(request({}))).status).toBe(422);
    vi.mocked(getRequestContext).mockResolvedValue(null);
    expect((await POST(request(VALID))).status).toBe(401);
  });

  it('fails closed when cryptographic verification fails', async () => {
    vi.mocked(getRequestContext).mockResolvedValue({ user: { id: 'user-1' } } as never);
    vi.mocked(registerIosAttestation).mockResolvedValue(false);
    expect((await POST(request(VALID))).status).toBe(403);
  });

  it('registers the verified key for the authenticated user', async () => {
    vi.mocked(getRequestContext).mockResolvedValue({ user: { id: 'user-1' } } as never);
    vi.mocked(registerIosAttestation).mockResolvedValue(true);
    const res = await POST(request(VALID));
    expect(res.status).toBe(201);
    expect(registerIosAttestation).toHaveBeenCalledWith({ userId: 'user-1', ...VALID });
  });
});
