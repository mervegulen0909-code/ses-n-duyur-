import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServiceClient: vi.fn(),
}));

import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { GET } from './route';

type Service = ReturnType<typeof createSupabaseServiceClient>;

const BATTLE = '11111111-1111-1111-1111-111111111111';

function makeRequest(secret?: string): Request {
  return new Request('http://localhost/api/cron/close-battles', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

function makeService(opts: {
  stale?: { id: string; perf_a: string; perf_b: string }[];
  result?: { closed: boolean; applied: boolean };
  closeError?: unknown;
}) {
  const limit = vi.fn(async () => ({
    data: opts.stale ?? [
      {
        id: BATTLE,
        perf_a: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        perf_b: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      },
    ],
    error: null,
  }));
  const from = vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({ lt: vi.fn(() => ({ limit })) })),
    })),
  }));
  const rpc = vi.fn(async () => ({
    data: [opts.result ?? { closed: true, applied: true }],
    error: opts.closeError ?? null,
  }));
  return { client: { from, rpc } as unknown as Service, rpc };
}

describe('GET /api/cron/close-battles', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-test-secret';
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    delete process.env.CRON_SECRET;
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('403 without the cron bearer secret', async () => {
    expect((await GET(makeRequest())).status).toBe(403);
    expect((await GET(makeRequest('wrong'))).status).toBe(403);
  });

  it('closes each stale battle through the atomic RPC', async () => {
    const svc = makeService({});
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.client);

    const res = await GET(makeRequest('cron-test-secret'));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ closed: 1, applied: 1, failed: 0 });
    expect(svc.rpc).toHaveBeenCalledWith('close_battle_atomic', {
      p_battle_id: BATTLE,
      p_cutoff: expect.any(String),
    });
  });

  it('counts a zero-vote close without an Elo application', async () => {
    const svc = makeService({ result: { closed: true, applied: false } });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.client);

    const res = await GET(makeRequest('cron-test-secret'));

    await expect(res.json()).resolves.toEqual({ closed: 1, applied: 0, failed: 0 });
  });

  it('treats an already-closed battle as a no-op', async () => {
    const svc = makeService({ result: { closed: false, applied: false } });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.client);

    const res = await GET(makeRequest('cron-test-secret'));

    await expect(res.json()).resolves.toEqual({ closed: 0, applied: 0, failed: 0 });
  });

  it('returns a failing status and leaves the battle retryable when the RPC fails', async () => {
    const svc = makeService({ closeError: { message: 'database unavailable' } });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.client);

    const res = await GET(makeRequest('cron-test-secret'));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ closed: 0, applied: 0, failed: 1 });
  });
});
