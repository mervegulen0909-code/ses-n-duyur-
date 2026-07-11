import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { grantBadge } from './badges';

describe('grantBadge', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('calls the grant_badge RPC with the user id and badge key', async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    const service = { rpc } as never;

    await grantBadge(service, 'user-1', 'first_performance');

    expect(rpc).toHaveBeenCalledWith('grant_badge', {
      p_user_id: 'user-1',
      p_badge_key: 'first_performance',
    });
  });

  it('never throws when the RPC rejects (badge grants are best-effort)', async () => {
    const rpc = vi.fn(async () => {
      throw new Error('db unavailable');
    });
    const service = { rpc } as never;

    await expect(grantBadge(service, 'user-1', 'centurion')).resolves.toBeUndefined();
  });
});
