import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServiceClient: vi.fn(),
}));
vi.mock('@/lib/expo-push', () => ({
  sendExpoPush: vi.fn(),
}));

import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { sendExpoPush } from '@/lib/expo-push';
import { GET } from './route';

type Service = ReturnType<typeof createSupabaseServiceClient>;

function makeRequest(auth?: string): Request {
  return new Request('http://localhost/api/cron/send-notifications', {
    headers: auth ? { authorization: auth } : {},
  });
}

const PENDING = [
  { id: 'evt-1', user_id: 'user-1', kind: 'new_vote', meta: { performanceId: 'perf-1' } },
];

function makeService(opts: {
  pending?: unknown[];
  tokens?: { id: string; user_id: string; token: string }[];
}) {
  const notifUpdateIn = vi.fn(async () => ({ error: null }));
  const notifUpdate = vi.fn(() => ({ in: notifUpdateIn }));
  const notifLimit = vi.fn(async () => ({ data: opts.pending ?? PENDING, error: null }));
  const notifOrder = vi.fn(() => ({ limit: notifLimit }));
  const notifIs = vi.fn(() => ({ order: notifOrder }));
  const notifSelect = vi.fn(() => ({ is: notifIs }));

  const tokensIn = vi.fn(async () => ({ data: opts.tokens ?? [] }));
  const tokensSelect = vi.fn(() => ({ in: tokensIn }));
  const deleteIn = vi.fn(async () => ({ error: null }));
  const tokensDelete = vi.fn(() => ({ in: deleteIn }));

  const from = vi.fn((table: string) => {
    if (table === 'notification_events') return { select: notifSelect, update: notifUpdate };
    if (table === 'push_tokens') return { select: tokensSelect, delete: tokensDelete };
    throw new Error(`unexpected table: ${table}`);
  });

  return {
    client: { from } as unknown as Service,
    from,
    notifUpdate,
    notifUpdateIn,
    tokensDelete,
    deleteIn,
  };
}

describe('GET /api/cron/send-notifications', () => {
  const ORIGINAL_SECRET = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = 'test-secret';
  });
  afterEach(() => {
    process.env.CRON_SECRET = ORIGINAL_SECRET;
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('403 when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(makeRequest('Bearer whatever'))).status).toBe(403);
  });

  it('403 when the Authorization header does not match', async () => {
    expect((await GET(makeRequest('Bearer wrong'))).status).toBe(403);
    expect(createSupabaseServiceClient).not.toHaveBeenCalled();
  });

  it('200 with zero counts when there is nothing pending', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeService({ pending: [] }).client);

    const res = await GET(makeRequest('Bearer test-secret'));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ processed: 0, sent: 0, pruned: 0 });
    expect(sendExpoPush).not.toHaveBeenCalled();
  });

  it('sends one push per token, then stamps sent_at on every processed event', async () => {
    const service = makeService({
      tokens: [{ id: 'tok-1', user_id: 'user-1', token: 'ExponentPushToken[a]' }],
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.client);
    vi.mocked(sendExpoPush).mockResolvedValue([{ status: 'ok', id: 'ticket-1' }]);

    const res = await GET(makeRequest('Bearer test-secret'));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ processed: 1, sent: 1, pruned: 0 });
    expect(sendExpoPush).toHaveBeenCalledWith([
      expect.objectContaining({ to: 'ExponentPushToken[a]', data: { performanceId: 'perf-1' } }),
    ]);
    expect(service.notifUpdateIn).toHaveBeenCalledWith('id', ['evt-1']);
  });

  it('marks an event processed even when its user has zero tokens', async () => {
    const service = makeService({ tokens: [] });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.client);
    vi.mocked(sendExpoPush).mockResolvedValue([]);

    const res = await GET(makeRequest('Bearer test-secret'));

    await expect(res.json()).resolves.toEqual({ processed: 1, sent: 0, pruned: 0 });
    expect(sendExpoPush).not.toHaveBeenCalled();
    expect(service.notifUpdateIn).toHaveBeenCalledWith('id', ['evt-1']);
  });

  it('prunes tokens Expo reports as DeviceNotRegistered', async () => {
    const service = makeService({
      tokens: [{ id: 'tok-stale', user_id: 'user-1', token: 'ExponentPushToken[dead]' }],
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.client);
    vi.mocked(sendExpoPush).mockResolvedValue([
      { status: 'error', details: { error: 'DeviceNotRegistered' } },
    ]);

    const res = await GET(makeRequest('Bearer test-secret'));

    await expect(res.json()).resolves.toEqual({ processed: 1, sent: 0, pruned: 1 });
    expect(service.deleteIn).toHaveBeenCalledWith('id', ['tok-stale']);
  });
});
