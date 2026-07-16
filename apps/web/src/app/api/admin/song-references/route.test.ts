import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  getRequestContext: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ getProfileForContext: vi.fn() }));
vi.mock('@/lib/guard', () => ({ rateLimit: vi.fn(async () => null) }));

import { getProfileForContext } from '@/lib/auth';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { POST } from './route';

const input = {
  songId: '11111111-1111-4111-8111-111111111111',
  sourceType: 'admin_annotation',
  durationSeconds: 2,
  tonicMidi: 60,
  notes: [
    { startSeconds: 0, endSeconds: 1, midi: 60 },
    { startSeconds: 1, endSeconds: 2, midi: 62 },
  ],
};

const request = (body: unknown = input) =>
  new Request('http://localhost/api/admin/song-references', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/admin/song-references', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(getRequestContext).mockResolvedValue({ user: { id: 'admin-1' } } as never);
    vi.mocked(getProfileForContext).mockResolvedValue({ role: 'admin' } as never);
  });
  afterEach(() => vi.restoreAllMocks());

  it('publishes a normalized reference through the atomic service RPC', async () => {
    const rpc = vi.fn(async () => ({ data: 'reference-1', error: null }));
    vi.mocked(createSupabaseServiceClient).mockReturnValue({ rpc } as never);

    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith('publish_song_reference', {
      p_song_id: input.songId,
      p_source_type: input.sourceType,
      p_notes: input.notes,
      p_duration_ms: 2000,
      p_tonic_midi: 60,
      p_created_by: 'admin-1',
    });
  });

  it('rejects malformed references before authentication or writes', async () => {
    const response = await POST(request({ ...input, notes: [input.notes[0]] }));
    expect(response.status).toBe(422);
    expect(getRequestContext).not.toHaveBeenCalled();
  });

  it('requires authentication and the admin role', async () => {
    vi.mocked(getRequestContext).mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(401);

    vi.mocked(getProfileForContext).mockResolvedValueOnce({ role: 'user' } as never);
    expect((await POST(request())).status).toBe(403);
  });

  it('maps a missing song without exposing database details', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue({
      rpc: vi.fn(async () => ({ data: null, error: { message: 'song_not_found', code: 'P0001' } })),
    } as never);
    const response = await POST(request());
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Song not found' });
  });
});
