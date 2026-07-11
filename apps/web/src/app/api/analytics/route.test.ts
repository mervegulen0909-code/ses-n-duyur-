import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  getRequestContext: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}));
vi.mock('@/lib/guard', () => ({
  analyticsRateLimit: vi.fn(async () => null),
}));

import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { POST } from './route';

const SESSION_ID = '11111111-1111-1111-1111-111111111111';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/analytics', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

type Service = ReturnType<typeof createSupabaseServiceClient>;

function makeService(insertResult: { error: unknown } = { error: null }) {
  const insert = vi.fn(async () => insertResult);
  const from = vi.fn(() => ({ insert }));
  return { service: { from } as unknown as Service, insert };
}

describe('POST /api/analytics — privacy-preserving event ingest', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('422 on a bad event name', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeService().service);
    const res = await POST(makeRequest({ event: 'not_a_real_event', sessionId: SESSION_ID }));
    expect(res.status).toBe(422);
  });

  it('201 anonymous (no session context needed)', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(null);
    const { service, insert } = makeService();
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service);

    const res = await POST(makeRequest({ event: 'landing_view', sessionId: SESSION_ID }));

    expect(res.status).toBe(201);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'landing_view', session_id: SESSION_ID, user_id: null }),
    );
  });

  it('201 authed, attaching the user id', async () => {
    vi.mocked(getRequestContext).mockResolvedValue({
      supabase: {},
      user: { id: 'u1' },
    } as never);
    const { service, insert } = makeService();
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service);

    const res = await POST(makeRequest({ event: 'vote_submitted', sessionId: SESSION_ID }));

    expect(res.status).toBe(201);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'u1' }));
  });

  it('503 when the service client is not configured', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(null);
    const res = await POST(makeRequest({ event: 'landing_view', sessionId: SESSION_ID }));
    expect(res.status).toBe(503);
  });
});
