import { afterEach, describe, expect, it, vi } from 'vitest';

import { sendExpoPush } from './expo-push';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('sendExpoPush', () => {
  it('posts to the Expo push endpoint and returns tickets in order', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [
          { status: 'ok', id: 't1' },
          { status: 'ok', id: 't2' },
        ],
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const tickets = await sendExpoPush([
      { to: 'ExponentPushToken[a]', title: 'Hi' },
      { to: 'ExponentPushToken[b]', title: 'Hi' },
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(tickets).toEqual([
      { status: 'ok', id: 't1' },
      { status: 'ok', id: 't2' },
    ]);
  });

  it('splits into 100-message chunks', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as unknown[];
      return {
        ok: true,
        json: async () => ({ data: body.map(() => ({ status: 'ok' })) }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const messages = Array.from({ length: 150 }, (_, i) => ({ to: `token-${i}` }));
    const tickets = await sendExpoPush(messages);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(tickets).toHaveLength(150);
  });

  it('produces error tickets for a chunk instead of throwing on network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );

    const tickets = await sendExpoPush([{ to: 'a' }, { to: 'b' }]);

    expect(tickets).toEqual([
      { status: 'error', message: 'network error' },
      { status: 'error', message: 'network error' },
    ]);
  });

  it('produces error tickets when Expo returns a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, json: async () => ({ errors: ['boom'] }) })),
    );

    const tickets = await sendExpoPush([{ to: 'a' }]);
    expect(tickets).toEqual([{ status: 'error', message: 'send failed' }]);
  });
});
