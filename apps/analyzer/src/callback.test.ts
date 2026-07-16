import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyzerResult } from '@voxscore/core';
import { CALLBACK_MAX_ATTEMPTS, CALLBACK_RETRY_DELAYS_MS, deliverCallback } from './callback';

const secret = 's'.repeat(32);
const url = 'https://web.example/api/internal/analysis-results';
const result = { sessionId: 'session' } as unknown as AnalyzerResult;

const ok = () => new Response('{}', { status: 200 });
const status = (code: number) => new Response(null, { status: code });

describe('Analyzer callback delivery', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('delivers on the first attempt with a signed body and no backoff', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(ok());
    const sleep = vi.fn().mockResolvedValue(undefined);
    await deliverCallback(result, url, secret, { fetchImpl, sleep });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    const [calledUrl, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe(url);
    const body = init.body as string;
    expect(JSON.parse(body)).toEqual({ sessionId: 'session' });
    const headers = init.headers as Record<string, string>;
    const expected = createHmac('sha256', secret)
      .update(`${headers['x-voxscore-timestamp']}.${body}`)
      .digest('hex');
    expect(headers['x-voxscore-signature']).toBe(`sha256=${expected}`);
  });

  it('retries 5xx responses and network errors with backoff, then succeeds', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(status(503))
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(ok());
    const sleep = vi.fn().mockResolvedValue(undefined);
    await deliverCallback(result, url, secret, { fetchImpl, sleep });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((call) => call[0])).toEqual([...CALLBACK_RETRY_DELAYS_MS]);
  });

  it('throws the last error after exhausting all attempts', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(status(502));
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(deliverCallback(result, url, secret, { fetchImpl, sleep })).rejects.toThrow(
      /failed with 502/,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(CALLBACK_MAX_ATTEMPTS);
  });

  it('fails fast on non-retryable 4xx responses', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(status(401));
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(deliverCallback(result, url, secret, { fetchImpl, sleep })).rejects.toThrow(
      /failed with 401/,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries 429 rate-limit responses', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(status(429))
      .mockResolvedValueOnce(ok());
    const sleep = vi.fn().mockResolvedValue(undefined);
    await deliverCallback(result, url, secret, { fetchImpl, sleep });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
