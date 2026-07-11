import { afterEach, describe, expect, it, vi } from 'vitest';
import type { createSupabaseServiceClient } from '@/lib/supabase/server';
import { trackServer } from './analytics-server';

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

function makeService(insertResult: { error: unknown } = { error: null }) {
  const insert = vi.fn(async () => insertResult);
  const from = vi.fn(() => ({ insert }));
  return { service: { from } as unknown as ServiceClient, from, insert };
}

describe('trackServer', () => {
  afterEach(() => vi.restoreAllMocks());

  it('inserts the event with the given userId and meta', async () => {
    const { service, insert } = makeService();

    await trackServer(service!, 'vote_submitted', 'user-1', { performanceId: 'perf-1' });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'vote_submitted',
        user_id: 'user-1',
        meta: { performanceId: 'perf-1' },
        session_id: expect.any(String),
      }),
    );
  });

  it('defaults user_id to null when omitted', async () => {
    const { service, insert } = makeService();

    await trackServer(service!, 'landing_view');

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: null, meta: null }));
  });

  it('never throws when the insert fails', async () => {
    const { service } = makeService({ error: { message: 'boom' } });

    await expect(trackServer(service!, 'vote_submitted', 'user-1')).resolves.toBeUndefined();
  });

  it('never throws when the client itself throws', async () => {
    const from = vi.fn(() => {
      throw new Error('boom');
    });
    const service = { from } as unknown as ServiceClient;

    await expect(trackServer(service!, 'vote_submitted', 'user-1')).resolves.toBeUndefined();
  });
});
