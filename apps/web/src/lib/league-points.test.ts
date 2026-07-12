import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { addLeaguePoints, currentWeekStart } from './league-points';

describe('currentWeekStart — Monday (UTC) of the given date', () => {
  it.each([
    ['2026-07-13T00:00:00Z', '2026-07-13'], // Monday → itself
    ['2026-07-15T09:30:00Z', '2026-07-13'], // Wednesday → back to Monday
    ['2026-07-19T23:59:59Z', '2026-07-13'], // Sunday → same Monday (Mon-Sun week)
    ['2026-07-12T12:00:00Z', '2026-07-06'], // Sunday (day===0 branch) → prior Monday
  ])('%s → %s', (now, expected) => {
    expect(currentWeekStart(new Date(now))).toBe(expected);
  });
});

describe('addLeaguePoints', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T09:30:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('delegates to the add_league_points RPC for this week', async () => {
    const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ error: null }));
    const service = { rpc } as never;

    await addLeaguePoints(service, 'user-1', 5);

    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0]!;
    expect(fn).toBe('add_league_points');
    expect(args).toEqual({
      p_user_id: 'user-1',
      p_week_start: '2026-07-13',
      p_delta: 5,
    });
  });

  it('uses the retry-safe award RPC when a source event is supplied', async () => {
    const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ error: null }));
    const service = { rpc } as never;

    await addLeaguePoints(service, 'user-1', 1, {
      kind: 'verified_listen',
      id: 'listen-1',
    });

    expect(rpc).toHaveBeenCalledWith('award_league_points', {
      p_user_id: 'user-1',
      p_week_start: '2026-07-13',
      p_delta: 1,
      p_source_kind: 'verified_listen',
      p_source_id: 'listen-1',
    });
  });

  it('is silent when the RPC throws (best-effort, never fails the request)', async () => {
    const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => {
      throw new Error('db down');
    });
    const service = { rpc } as never;

    await expect(addLeaguePoints(service, 'user-1', 1)).resolves.toBeUndefined();
  });
});
