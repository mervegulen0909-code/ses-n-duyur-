import { afterEach, describe, expect, it, vi } from 'vitest';

import { currentListenStreak } from './streak-server';

function makeService(rows: { created_at: string }[] | null) {
  const gte = vi.fn(async () => ({ data: rows }));
  const eqValid = vi.fn(() => ({ gte }));
  const eqUser = vi.fn(() => ({ eq: eqValid }));
  const select = vi.fn(() => ({ eq: eqUser }));
  const from = vi.fn(() => ({ select }));
  return { service: { from } as never, from, select, eqUser, eqValid, gte };
}

describe('currentListenStreak', () => {
  afterEach(() => vi.clearAllMocks());

  it('slices timestamps to UTC days and delegates to computeStreak', async () => {
    const svc = makeService([
      { created_at: '2026-07-10T23:59:59.000Z' },
      { created_at: '2026-07-11T05:00:00.000Z' },
      { created_at: '2026-07-12T12:30:00.000Z' },
      { created_at: '2026-07-12T13:00:00.000Z' }, // same day — deduped
    ]);

    await expect(currentListenStreak(svc.service, 'user-1', '2026-07-12')).resolves.toBe(3);

    // Only this user's VALID listens from the 60-day window count.
    expect(svc.from).toHaveBeenCalledWith('verified_listens');
    expect(svc.select).toHaveBeenCalledWith('created_at');
    expect(svc.eqUser).toHaveBeenCalledWith('user_id', 'user-1');
    expect(svc.eqValid).toHaveBeenCalledWith('is_valid', true);
    expect(svc.gte).toHaveBeenCalledWith('created_at', '2026-05-13T00:00:00.000Z');
  });

  it('returns 0 when the user has no valid listens (null data)', async () => {
    const svc = makeService(null);
    await expect(currentListenStreak(svc.service, 'user-1', '2026-07-12')).resolves.toBe(0);
  });
});
