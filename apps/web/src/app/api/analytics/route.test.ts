import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  getRequestContext: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}));
vi.mock('@/lib/guard', () => ({
  analyticsRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/notify', () => ({
  notifyServer: vi.fn(async () => undefined),
}));

import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { notifyServer } from '@/lib/notify';
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

  it('queues a day-1 comeback push ~24h ahead on an authed signup_completed', async () => {
    vi.mocked(getRequestContext).mockResolvedValue({
      supabase: {},
      user: { id: 'u1' },
    } as never);
    const { service } = makeService();
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service);

    const before = Date.now();
    const res = await POST(makeRequest({ event: 'signup_completed', sessionId: SESSION_ID }));
    const after = Date.now();

    expect(res.status).toBe(201);
    expect(notifyServer).toHaveBeenCalledWith(
      service,
      'u1',
      'day1_comeback',
      {},
      { scheduledFor: expect.any(String) },
    );
    const { scheduledFor } = vi.mocked(notifyServer).mock.calls[0]![4] as { scheduledFor: string };
    const dayMs = 24 * 60 * 60 * 1000;
    expect(Date.parse(scheduledFor)).toBeGreaterThanOrEqual(before + dayMs);
    expect(Date.parse(scheduledFor)).toBeLessThanOrEqual(after + dayMs);
  });

  it('does NOT queue the comeback push for an anonymous signup_completed', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(null);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeService().service);

    const res = await POST(makeRequest({ event: 'signup_completed', sessionId: SESSION_ID }));

    expect(res.status).toBe(201);
    expect(notifyServer).not.toHaveBeenCalled();
  });

  it('does NOT queue the comeback push for other authed events', async () => {
    vi.mocked(getRequestContext).mockResolvedValue({
      supabase: {},
      user: { id: 'u1' },
    } as never);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeService().service);

    const res = await POST(makeRequest({ event: 'vote_submitted', sessionId: SESSION_ID }));

    expect(res.status).toBe(201);
    expect(notifyServer).not.toHaveBeenCalled();
  });

  it('503 when the service client is not configured', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(null);
    const res = await POST(makeRequest({ event: 'landing_view', sessionId: SESSION_ID }));
    expect(res.status).toBe(503);
  });
});
