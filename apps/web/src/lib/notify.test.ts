import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { notifyServer } from './notify';

describe('notifyServer', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('inserts a pending notification_events row', async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const from = vi.fn(() => ({ insert }));
    const service = { from } as never;

    await notifyServer(service, 'user-1', 'new_vote', { performanceId: 'perf-1' });

    expect(from).toHaveBeenCalledWith('notification_events');
    expect(insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      kind: 'new_vote',
      meta: { performanceId: 'perf-1' },
    });
  });

  it('passes scheduled_for through when opts.scheduledFor is set', async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const from = vi.fn(() => ({ insert }));
    const service = { from } as never;

    await notifyServer(
      service,
      'user-1',
      'day1_comeback',
      {},
      { scheduledFor: '2026-07-13T12:00:00.000Z' },
    );

    expect(insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      kind: 'day1_comeback',
      meta: {},
      scheduled_for: '2026-07-13T12:00:00.000Z',
    });
  });

  it('omits scheduled_for by default (immediate delivery)', async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const from = vi.fn(() => ({ insert }));
    const service = { from } as never;

    await notifyServer(service, 'user-1', 'new_vote');

    expect((insert.mock.calls[0] as unknown[])[0]).not.toHaveProperty('scheduled_for');
  });

  it('never throws when the insert rejects (notifications are best-effort)', async () => {
    const from = vi.fn(() => ({
      insert: vi.fn(async () => {
        throw new Error('db unavailable');
      }),
    }));
    const service = { from } as never;

    await expect(
      notifyServer(service, 'user-1', 'performance_request_approved'),
    ).resolves.toBeUndefined();
  });
});
