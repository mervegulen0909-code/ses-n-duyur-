import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServiceClient: vi.fn() }));
vi.mock('@/lib/expo-push', () => ({ sendExpoPush: vi.fn() }));

import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { sendExpoPush } from '@/lib/expo-push';
import { GET } from './route';

type Service = ReturnType<typeof createSupabaseServiceClient>;

const PENDING = [
  {
    id: 'evt-1',
    user_id: 'user-1',
    kind: 'new_vote',
    meta: { performanceId: 'perf-1' },
    attempt_count: 1,
  },
];

function makeRequest(auth?: string): Request {
  return new Request('http://localhost/api/cron/send-notifications', {
    headers: auth ? { authorization: auth } : {},
  });
}

function makeService(
  opts: {
    pending?: unknown[];
    tokens?: { id: string; user_id: string; token: string }[];
    locale?: string;
    tokenError?: unknown;
    updateError?: unknown;
  } = {},
) {
  const updates: { patch: Record<string, unknown>; ids: string[] }[] = [];
  const rpc = vi.fn(async () => ({ data: opts.pending ?? PENDING, error: null }));
  const tokenIn = vi.fn(async () => ({ data: opts.tokens ?? [], error: opts.tokenError ?? null }));
  const deleteIn = vi.fn(async () => ({ error: null }));
  const updateIn = vi.fn(async function (this: { patch?: Record<string, unknown> }, _key, ids) {
    updates.push({ patch: this.patch ?? {}, ids });
    return { error: opts.updateError ?? null };
  });

  const from = vi.fn((table: string) => {
    if (table === 'push_tokens') {
      return {
        select: () => ({ in: tokenIn }),
        delete: () => ({ in: deleteIn }),
      };
    }
    if (table === 'notification_events') {
      return {
        update: (patch: Record<string, unknown>) => ({
          in: (key: string, ids: string[]) => updateIn.call({ patch }, key, ids),
        }),
      };
    }
    if (table === 'profiles') {
      return {
        select: () => ({
          in: async () => ({
            data: [{ id: 'user-1', locale: opts.locale ?? 'en' }],
            error: null,
          }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });

  return {
    client: { rpc, from } as unknown as Service,
    rpc,
    updates,
    deleteIn,
  };
}

describe('GET /api/cron/send-notifications — durable delivery', () => {
  const originalSecret = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = 'test-secret';
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('403 without the exact cron bearer secret', async () => {
    expect((await GET(makeRequest())).status).toBe(403);
    expect((await GET(makeRequest('Bearer wrong'))).status).toBe(403);
  });

  it('atomically claims work and returns zero counts for an empty queue', async () => {
    const service = makeService({ pending: [] });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.client);

    const res = await GET(makeRequest('Bearer test-secret'));

    expect(service.rpc).toHaveBeenCalledWith('claim_notification_events', { p_limit: 200 });
    await expect(res.json()).resolves.toEqual({
      processed: 0,
      sent: 0,
      retried: 0,
      deadLettered: 0,
      noTokens: 0,
      pruned: 0,
    });
  });

  it('marks an event sent only after at least one successful Expo ticket', async () => {
    const service = makeService({
      tokens: [{ id: 'tok-1', user_id: 'user-1', token: 'ExponentPushToken[a]' }],
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.client);
    vi.mocked(sendExpoPush).mockResolvedValue([{ status: 'ok', id: 'ticket-1' }]);

    const res = await GET(makeRequest('Bearer test-secret'));

    await expect(res.json()).resolves.toMatchObject({ processed: 1, sent: 1, retried: 0 });
    expect(sendExpoPush).toHaveBeenCalledWith([
      expect.objectContaining({ to: 'ExponentPushToken[a]', data: { performanceId: 'perf-1' } }),
    ]);
    expect(service.updates).toContainEqual({
      ids: ['evt-1'],
      patch: expect.objectContaining({ delivery_status: 'sent', sent_at: expect.any(String) }),
    });
  });

  it('uses the user’s persisted locale for push copy', async () => {
    const service = makeService({
      locale: 'tr',
      tokens: [{ id: 'tok-1', user_id: 'user-1', token: 'ExponentPushToken[a]' }],
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.client);
    vi.mocked(sendExpoPush).mockResolvedValue([{ status: 'ok', id: 'ticket-1' }]);

    await GET(makeRequest('Bearer test-secret'));

    expect(sendExpoPush).toHaveBeenCalledWith([
      expect.objectContaining({ title: 'Yeni oy', body: 'Birisi performansına oy verdi.' }),
    ]);
  });

  it('records an explicit no_tokens terminal state instead of pretending delivery', async () => {
    const service = makeService();
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.client);

    const res = await GET(makeRequest('Bearer test-secret'));

    await expect(res.json()).resolves.toMatchObject({ noTokens: 1, sent: 0 });
    expect(sendExpoPush).not.toHaveBeenCalled();
    expect(service.updates).toContainEqual({
      ids: ['evt-1'],
      patch: expect.objectContaining({ delivery_status: 'no_tokens' }),
    });
  });

  it('retries a transient delivery error with exponential backoff', async () => {
    const service = makeService({
      tokens: [{ id: 'tok-1', user_id: 'user-1', token: 'ExponentPushToken[a]' }],
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.client);
    vi.mocked(sendExpoPush).mockResolvedValue([{ status: 'error', message: 'network error' }]);

    const before = Date.now();
    const res = await GET(makeRequest('Bearer test-secret'));

    await expect(res.json()).resolves.toMatchObject({ retried: 1, deadLettered: 0 });
    const retry = service.updates.find((entry) => entry.patch.delivery_status === 'pending');
    expect(retry?.ids).toEqual(['evt-1']);
    expect(Date.parse(String(retry?.patch.next_attempt_at))).toBeGreaterThanOrEqual(
      before + 60_000,
    );
  });

  it('dead-letters a transient failure at the maximum attempt count', async () => {
    const service = makeService({
      pending: [{ ...PENDING[0], attempt_count: 5 }],
      tokens: [{ id: 'tok-1', user_id: 'user-1', token: 'ExponentPushToken[a]' }],
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.client);
    vi.mocked(sendExpoPush).mockResolvedValue([{ status: 'error', message: 'network error' }]);

    const res = await GET(makeRequest('Bearer test-secret'));

    await expect(res.json()).resolves.toMatchObject({ retried: 0, deadLettered: 1 });
    expect(service.updates).toContainEqual({
      ids: ['evt-1'],
      patch: expect.objectContaining({ delivery_status: 'dead_letter' }),
    });
  });

  it('prunes permanently invalid tokens and terminally records the event', async () => {
    const service = makeService({
      tokens: [{ id: 'tok-dead', user_id: 'user-1', token: 'ExponentPushToken[dead]' }],
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.client);
    vi.mocked(sendExpoPush).mockResolvedValue([
      { status: 'error', details: { error: 'DeviceNotRegistered' } },
    ]);

    const res = await GET(makeRequest('Bearer test-secret'));

    await expect(res.json()).resolves.toMatchObject({ noTokens: 1, pruned: 1 });
    expect(service.deleteIn).toHaveBeenCalledWith('id', ['tok-dead']);
  });

  it('releases claimed rows when token lookup fails', async () => {
    const service = makeService({ tokenError: { message: 'db down' } });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.client);

    const res = await GET(makeRequest('Bearer test-secret'));

    expect(res.status).toBe(500);
    expect(service.updates).toContainEqual({
      ids: ['evt-1'],
      patch: expect.objectContaining({
        delivery_status: 'pending',
        last_error: 'push_token_lookup_failed',
      }),
    });
  });

  it('fails loudly when the queue state cannot be persisted', async () => {
    const service = makeService({ updateError: { message: 'write failed' } });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.client);

    const res = await GET(makeRequest('Bearer test-secret'));

    expect(res.status).toBe(500);
  });
});
