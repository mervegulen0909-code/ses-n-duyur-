import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const verify = vi.hoisted(() => vi.fn<(_: string | null) => Promise<boolean>>());
const check = vi.hoisted(() => vi.fn<(_: string) => Promise<{ success: boolean }>>());

vi.mock('./adapters/botcheck', () => ({
  getBotCheck: () => ({ verify }),
}));

vi.mock('./adapters/ratelimit', () => ({
  getRateLimiter: () => ({ check }),
}));

import { botGuard, isNativeClientRequest, rateLimit } from './guard';

describe('guard helpers', () => {
  beforeEach(() => {
    verify.mockResolvedValue(true);
    check.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('recognizes the native mobile client only when both marker header and Bearer auth exist', () => {
    expect(
      isNativeClientRequest(
        new Request('http://localhost', {
          headers: {
            authorization: 'Bearer token-123',
            'x-voxscore-client': 'mobile-app',
          },
        }),
      ),
    ).toBe(true);

    expect(
      isNativeClientRequest(
        new Request('http://localhost', {
          headers: { 'x-voxscore-client': 'mobile-app' },
        }),
      ),
    ).toBe(false);
  });

  it('skips the Turnstile check for authenticated native mobile writes', async () => {
    verify.mockResolvedValue(false);

    const blocked = await botGuard(
      new Request('http://localhost', {
        headers: {
          authorization: 'Bearer token-123',
          'x-voxscore-client': 'mobile-app',
        },
      }),
    );

    expect(blocked).toBeNull();
    expect(verify).not.toHaveBeenCalled();
  });

  it('still enforces Turnstile for browser-style requests', async () => {
    verify.mockResolvedValue(false);

    const blocked = await botGuard(new Request('http://localhost'));

    expect(blocked?.status).toBe(403);
    expect(verify).toHaveBeenCalledWith(null);
  });

  it('rate-limits by user id when one is available', async () => {
    check.mockResolvedValueOnce({ success: false });

    const blocked = await rateLimit(new Request('http://localhost'), 'user-1');

    expect(blocked?.status).toBe(429);
    expect(check).toHaveBeenCalledWith('u:user-1');
  });
});
