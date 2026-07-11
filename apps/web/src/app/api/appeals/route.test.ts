import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  getRequestContext: vi.fn(),
}));
vi.mock('@/lib/guard', () => ({
  rateLimit: vi.fn(async () => null),
}));

import { getRequestContext } from '@/lib/supabase/server';
import { GET, POST } from './route';

type RequestCtx = Awaited<ReturnType<typeof getRequestContext>>;

const TARGET_ID = '11111111-1111-1111-1111-111111111111';
const VALID_BODY = {
  targetType: 'performance',
  targetId: TARGET_ID,
  reason: 'This was hidden by mistake, please review it again.',
};

function makeRequest(body: unknown = VALID_BODY, method = 'POST'): Request {
  return new Request('http://localhost/api/appeals', {
    method,
    headers: { 'content-type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  });
}

function makeUserClient(insertResult: { data: { id: string } | null; error: unknown }) {
  const single = vi.fn(async () => insertResult);
  const insert = vi.fn(() => ({ select: () => ({ single }) }));
  const order = vi.fn(async () => ({ data: [], error: null }));
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ insert, select }));
  return { supabase: { from } as unknown, insert, from };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('POST /api/appeals', () => {
  it('401 when unauthenticated', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(null);
    expect((await POST(makeRequest())).status).toBe(401);
  });

  it('422 on a missing target', async () => {
    vi.mocked(getRequestContext).mockResolvedValue({
      supabase: makeUserClient({ data: { id: 'a1' }, error: null }).supabase,
      user: { id: 'u1' },
    } as unknown as RequestCtx);
    const res = await POST(makeRequest({ reason: 'no target given at all here' }));
    expect(res.status).toBe(422);
  });

  it('422 on a too-short reason', async () => {
    vi.mocked(getRequestContext).mockResolvedValue({
      supabase: makeUserClient({ data: { id: 'a1' }, error: null }).supabase,
      user: { id: 'u1' },
    } as unknown as RequestCtx);
    const res = await POST(makeRequest({ ...VALID_BODY, reason: 'short' }));
    expect(res.status).toBe(422);
  });

  it('422 on an invalid targetType', async () => {
    vi.mocked(getRequestContext).mockResolvedValue({
      supabase: makeUserClient({ data: { id: 'a1' }, error: null }).supabase,
      user: { id: 'u1' },
    } as unknown as RequestCtx);
    const res = await POST(makeRequest({ ...VALID_BODY, targetType: 'song' }));
    expect(res.status).toBe(422);
  });

  it('201 happy path inserts as the user', async () => {
    const user = makeUserClient({ data: { id: 'appeal-new' }, error: null });
    vi.mocked(getRequestContext).mockResolvedValue({
      supabase: user.supabase,
      user: { id: 'u1' },
    } as unknown as RequestCtx);

    const res = await POST(makeRequest());
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ id: 'appeal-new' });
    expect(user.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u1',
        target_type: 'performance',
        target_id: TARGET_ID,
      }),
    );
  });

  it('500 when the insert fails', async () => {
    const user = makeUserClient({ data: null, error: { code: '42P01' } });
    vi.mocked(getRequestContext).mockResolvedValue({
      supabase: user.supabase,
      user: { id: 'u1' },
    } as unknown as RequestCtx);
    expect((await POST(makeRequest())).status).toBe(500);
  });
});

describe('GET /api/appeals', () => {
  it('401 when unauthenticated', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(null);
    expect((await GET(makeRequest(undefined, 'GET'))).status).toBe(401);
  });

  it('200 returns the caller-scoped list', async () => {
    const order = vi.fn(async () => ({
      data: [{ id: 'appeal-1', status: 'pending' }],
      error: null,
    }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    vi.mocked(getRequestContext).mockResolvedValue({
      supabase: { from },
      user: { id: 'u1' },
    } as unknown as RequestCtx);

    const res = await GET(makeRequest(undefined, 'GET'));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      appeals: [{ id: 'appeal-1', status: 'pending' }],
    });
    expect(eq).toHaveBeenCalledWith('user_id', 'u1');
  });
});
