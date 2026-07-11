import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  getRequestContext: vi.fn(),
}));
vi.mock('@/lib/guard', () => ({
  rateLimit: vi.fn(async () => null),
}));

import { getRequestContext } from '@/lib/supabase/server';
import { DELETE, POST } from './route';

type RequestCtx = Awaited<ReturnType<typeof getRequestContext>>;

function makeRequest(body: unknown = { followeeHandle: 'target' }, method = 'POST'): Request {
  return new Request('http://localhost/api/follows', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * User-scoped client stub: `profiles` resolves the handle lookup, `follows`
 * records the insert/delete. Everything runs as the user — there is no
 * service client in this route at all.
 */
function makeClient(opts: {
  profile?: { id: string } | null;
  insertError?: { code: string } | null;
  deleteError?: { code: string } | null;
}) {
  const insert = vi.fn(async () => ({ error: opts.insertError ?? null }));
  const deleteEq2 = vi.fn(async () => ({ error: opts.deleteError ?? null }));
  const deleteEq1 = vi.fn(() => ({ eq: deleteEq2 }));
  const del = vi.fn(() => ({ eq: deleteEq1 }));
  const maybeSingle = vi.fn(async () => ({ data: opts.profile ?? null, error: null }));
  const profilesEq = vi.fn(() => ({ maybeSingle }));
  const from = vi.fn((table: string) =>
    table === 'profiles' ? { select: vi.fn(() => ({ eq: profilesEq })) } : { insert, delete: del },
  );
  return { supabase: { from } as unknown, insert, del, deleteEq1, deleteEq2 };
}

function mockCtx(client: { supabase: unknown }, userId = 'u1') {
  vi.mocked(getRequestContext).mockResolvedValue({
    supabase: client.supabase,
    user: { id: userId },
  } as unknown as RequestCtx);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('POST /api/follows', () => {
  it('401 when unauthenticated', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(null);
    expect((await POST(makeRequest())).status).toBe(401);
  });

  it('422 on a missing handle', async () => {
    mockCtx(makeClient({ profile: { id: 'p2' } }));
    expect((await POST(makeRequest({}))).status).toBe(422);
  });

  it('404 when the handle does not exist', async () => {
    mockCtx(makeClient({ profile: null }));
    expect((await POST(makeRequest())).status).toBe(404);
  });

  it('422 on a self-follow', async () => {
    const client = makeClient({ profile: { id: 'u1' } });
    mockCtx(client, 'u1');
    const res = await POST(makeRequest());
    expect(res.status).toBe(422);
    expect(client.insert).not.toHaveBeenCalled();
  });

  it('201 inserts the edge as the user', async () => {
    const client = makeClient({ profile: { id: 'p2' } });
    mockCtx(client, 'u1');
    const res = await POST(makeRequest());
    expect(res.status).toBe(201);
    expect(client.insert).toHaveBeenCalledWith({ follower_id: 'u1', followee_id: 'p2' });
  });

  it('409 when already following (PK race)', async () => {
    mockCtx(makeClient({ profile: { id: 'p2' }, insertError: { code: '23505' } }));
    expect((await POST(makeRequest())).status).toBe(409);
  });

  it('500 on any other insert error', async () => {
    mockCtx(makeClient({ profile: { id: 'p2' }, insertError: { code: '42P01' } }));
    expect((await POST(makeRequest())).status).toBe(500);
  });
});

describe('DELETE /api/follows', () => {
  it('401 when unauthenticated', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(null);
    expect((await DELETE(makeRequest(undefined, 'DELETE'))).status).toBe(401);
  });

  it('200 deletes only the caller-owned edge (idempotent)', async () => {
    const client = makeClient({ profile: { id: 'p2' } });
    mockCtx(client, 'u1');
    const res = await DELETE(makeRequest({ followeeHandle: 'target' }, 'DELETE'));
    expect(res.status).toBe(200);
    expect(client.deleteEq1).toHaveBeenCalledWith('follower_id', 'u1');
    expect(client.deleteEq2).toHaveBeenCalledWith('followee_id', 'p2');
  });

  it('404 when the handle does not exist', async () => {
    mockCtx(makeClient({ profile: null }));
    expect((await DELETE(makeRequest({ followeeHandle: 'ghost' }, 'DELETE'))).status).toBe(404);
  });
});
