import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  getRequestContext: vi.fn(),
}));
vi.mock('@/lib/guard', () => ({
  rateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/env', () => ({
  getSupabaseEnv: vi.fn(() => ({ url: 'https://proj.supabase.co', anonKey: 'anon' })),
}));

import { getRequestContext } from '@/lib/supabase/server';
import { PATCH } from './route';

type RequestCtx = Awaited<ReturnType<typeof getRequestContext>>;

const OWN_AVATAR = 'https://proj.supabase.co/storage/v1/object/public/avatars/u1/pic.png';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/profile', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeClient(updateResult: { error: unknown } = { error: null }) {
  const eq = vi.fn(async () => updateResult);
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  return { supabase: { from } as unknown, update, eq };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('PATCH /api/profile', () => {
  it('401 when unauthenticated', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(null);
    expect((await PATCH(makeRequest({ bio: 'hi' }))).status).toBe(401);
  });

  it('422 on a too-long bio', async () => {
    vi.mocked(getRequestContext).mockResolvedValue({
      supabase: makeClient().supabase,
      user: { id: 'u1' },
    } as unknown as RequestCtx);
    const res = await PATCH(makeRequest({ bio: 'x'.repeat(501) }));
    expect(res.status).toBe(422);
  });

  it('422 on more than 5 links', async () => {
    vi.mocked(getRequestContext).mockResolvedValue({
      supabase: makeClient().supabase,
      user: { id: 'u1' },
    } as unknown as RequestCtx);
    const links = Array.from({ length: 6 }, (_, i) => ({
      label: `l${i}`,
      url: 'https://example.com',
    }));
    const res = await PATCH(makeRequest({ links }));
    expect(res.status).toBe(422);
  });

  it('422 on an empty body', async () => {
    vi.mocked(getRequestContext).mockResolvedValue({
      supabase: makeClient().supabase,
      user: { id: 'u1' },
    } as unknown as RequestCtx);
    expect((await PATCH(makeRequest({}))).status).toBe(422);
  });

  it("422 when avatarUrl is not the caller's own avatars folder", async () => {
    vi.mocked(getRequestContext).mockResolvedValue({
      supabase: makeClient().supabase,
      user: { id: 'u1' },
    } as unknown as RequestCtx);
    const res = await PATCH(
      makeRequest({
        avatarUrl: 'https://proj.supabase.co/storage/v1/object/public/avatars/someone-else/pic.png',
      }),
    );
    expect(res.status).toBe(422);
  });

  it('422 when avatarUrl is an external URL entirely', async () => {
    vi.mocked(getRequestContext).mockResolvedValue({
      supabase: makeClient().supabase,
      user: { id: 'u1' },
    } as unknown as RequestCtx);
    const res = await PATCH(makeRequest({ avatarUrl: 'https://evil.example.com/x.png' }));
    expect(res.status).toBe(422);
  });

  it('200 updates own row with bio + own avatarUrl + links', async () => {
    const client = makeClient();
    vi.mocked(getRequestContext).mockResolvedValue({
      supabase: client.supabase,
      user: { id: 'u1' },
    } as unknown as RequestCtx);

    const res = await PATCH(
      makeRequest({
        bio: 'Singer from Istanbul.',
        avatarUrl: OWN_AVATAR,
        links: [{ label: 'Instagram', url: 'https://instagram.com/me' }],
      }),
    );

    expect(res.status).toBe(200);
    expect(client.update).toHaveBeenCalledWith({
      bio: 'Singer from Istanbul.',
      avatar_url: OWN_AVATAR,
      links: [{ label: 'Instagram', url: 'https://instagram.com/me' }],
    });
    expect(client.eq).toHaveBeenCalledWith('id', 'u1');
  });

  it('200 clearing bio and avatar with null', async () => {
    const client = makeClient();
    vi.mocked(getRequestContext).mockResolvedValue({
      supabase: client.supabase,
      user: { id: 'u1' },
    } as unknown as RequestCtx);

    const res = await PATCH(makeRequest({ bio: null, avatarUrl: null }));
    expect(res.status).toBe(200);
    expect(client.update).toHaveBeenCalledWith({ bio: null, avatar_url: null });
  });

  it('500 when the update fails', async () => {
    const client = makeClient({ error: { message: 'boom' } });
    vi.mocked(getRequestContext).mockResolvedValue({
      supabase: client.supabase,
      user: { id: 'u1' },
    } as unknown as RequestCtx);
    const res = await PATCH(makeRequest({ bio: 'hi' }));
    expect(res.status).toBe(500);
  });
});
