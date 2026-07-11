import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  getRequestContext: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}));
vi.mock('@/lib/guard', () => ({
  rateLimit: vi.fn(async () => null),
  botGuard: vi.fn(async () => null),
}));
vi.mock('@/lib/analytics-server', () => ({
  trackServer: vi.fn(async () => {}),
}));

import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { trackServer } from '@/lib/analytics-server';
import { GET, POST } from './route';

const VALID_BODY = {
  youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
  category: 'pop',
};

function makeRequest(body: unknown = VALID_BODY, method = 'POST'): Request {
  return new Request('http://localhost/api/performance-requests', {
    method,
    headers: { 'content-type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  });
}

type RequestCtx = Awaited<ReturnType<typeof getRequestContext>>;
type Service = ReturnType<typeof createSupabaseServiceClient>;

function makeUserClient(insertResult: { data: { id: string } | null; error: unknown }) {
  const single = vi.fn(async () => insertResult);
  const insert = vi.fn(() => ({ select: () => ({ single }) }));
  const order = vi.fn(async () => ({ data: [], error: null }));
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ insert, select }));
  return { supabase: { from } as unknown, insert, from };
}

function makeService(opts: { existingPerf?: unknown; existingPending?: unknown } = {}): Service {
  const from = vi.fn((table: string) => {
    const result =
      table === 'performances' ? (opts.existingPerf ?? null) : (opts.existingPending ?? null);
    const maybeSingle = vi.fn(async () => ({ data: result, error: null }));
    const eq2 = vi.fn(() => ({ maybeSingle }));
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const select = vi.fn(() => ({ eq: eq1 }));
    return { select };
  });
  return { from } as unknown as Service;
}

describe('POST /api/performance-requests — user request queue', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('401 when unauthenticated', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(null);
    expect((await POST(makeRequest())).status).toBe(401);
  });

  it('422 on invalid input (missing category)', async () => {
    const user = makeUserClient({ data: { id: 'req-1' }, error: null });
    vi.mocked(getRequestContext).mockResolvedValue({
      supabase: user.supabase,
      user: { id: 'u1' },
    } as unknown as RequestCtx);

    const res = await POST(makeRequest({ youtubeUrl: VALID_BODY.youtubeUrl }));
    expect(res.status).toBe(422);
  });

  it('422 on an invalid YouTube URL', async () => {
    const user = makeUserClient({ data: { id: 'req-1' }, error: null });
    vi.mocked(getRequestContext).mockResolvedValue({
      supabase: user.supabase,
      user: { id: 'u1' },
    } as unknown as RequestCtx);

    const res = await POST(makeRequest({ youtubeUrl: 'https://example.com', category: 'pop' }));
    expect(res.status).toBe(422);
  });

  it('422 on an invalid category value', async () => {
    const user = makeUserClient({ data: { id: 'req-1' }, error: null });
    vi.mocked(getRequestContext).mockResolvedValue({
      supabase: user.supabase,
      user: { id: 'u1' },
    } as unknown as RequestCtx);

    const res = await POST(
      makeRequest({ youtubeUrl: VALID_BODY.youtubeUrl, category: 'not-a-real-category' }),
    );
    expect(res.status).toBe(422);
  });

  it('409 when the video is already an active performance', async () => {
    const user = makeUserClient({ data: { id: 'req-1' }, error: null });
    vi.mocked(getRequestContext).mockResolvedValue({
      supabase: user.supabase,
      user: { id: 'u1' },
    } as unknown as RequestCtx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeService({ existingPerf: { id: 'perf-1' } }),
    );

    const res = await POST(makeRequest());
    expect(res.status).toBe(409);
    expect(user.insert).not.toHaveBeenCalled();
  });

  it('409 when a pending request for the same video exists', async () => {
    const user = makeUserClient({ data: { id: 'req-1' }, error: null });
    vi.mocked(getRequestContext).mockResolvedValue({
      supabase: user.supabase,
      user: { id: 'u1' },
    } as unknown as RequestCtx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeService({ existingPending: { id: 'req-existing' } }),
    );

    const res = await POST(makeRequest());
    expect(res.status).toBe(409);
    expect(user.insert).not.toHaveBeenCalled();
  });

  it('409 when the unique index catches a race the pre-check missed', async () => {
    const user = makeUserClient({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });
    vi.mocked(getRequestContext).mockResolvedValue({
      supabase: user.supabase,
      user: { id: 'u1' },
    } as unknown as RequestCtx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeService());

    const res = await POST(makeRequest());
    expect(res.status).toBe(409);
  });

  it('201 happy path inserts as the user', async () => {
    const user = makeUserClient({ data: { id: 'req-new' }, error: null });
    vi.mocked(getRequestContext).mockResolvedValue({
      supabase: user.supabase,
      user: { id: 'u1' },
    } as unknown as RequestCtx);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeService());

    const res = await POST(makeRequest());
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ id: 'req-new' });
    expect(user.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u1',
        youtube_video_id: 'dQw4w9WgXcQ',
        category: 'pop',
      }),
    );
    expect(trackServer).toHaveBeenCalledWith(
      expect.anything(),
      'performance_request_submitted',
      'u1',
      expect.objectContaining({ category: 'pop' }),
    );
  });
});

describe('GET /api/performance-requests — my requests', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('401 when unauthenticated', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(null);
    expect((await GET(makeRequest(undefined, 'GET'))).status).toBe(401);
  });

  it('200 returns the caller-scoped list', async () => {
    const order = vi.fn(async () => ({
      data: [{ id: 'req-1', status: 'pending' }],
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
    await expect(res.json()).resolves.toEqual({ requests: [{ id: 'req-1', status: 'pending' }] });
    expect(eq).toHaveBeenCalledWith('user_id', 'u1');
  });
});
