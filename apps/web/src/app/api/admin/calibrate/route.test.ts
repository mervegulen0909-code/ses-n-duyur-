import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// getRequestContext resolves the authed client (cookie OR bearer); getProfileForContext
// reads the role through that same RLS-scoped client so either auth path authorizes alike.
vi.mock('@/lib/supabase/server', () => ({
  getRequestContext: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  getProfileForContext: vi.fn(),
}));

import { getProfileForContext } from '@/lib/auth';
import { getRequestContext } from '@/lib/supabase/server';
import { POST } from './route';

const PERF = '11111111-1111-1111-1111-111111111111';

type RequestCtx = Awaited<ReturnType<typeof getRequestContext>>;
type Profile = Awaited<ReturnType<typeof getProfileForContext>>;

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/admin/calibrate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeBadRequest(): Request {
  return new Request('http://localhost/api/admin/calibrate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: 'not json',
  });
}

const validBody = { performanceId: PERF, criteria: { vocalAccuracy: 80 } };

// RLS-scoped client exposing the single write the route performs.
function makeCtx(opts: { insertError?: unknown } = {}) {
  const insert = vi.fn(async () => ({ error: opts.insertError ?? null }));
  const from = vi.fn(() => ({ insert }));
  return { ctx: { supabase: { from }, user: { id: 'me' } } as unknown as RequestCtx, insert, from };
}

const adminProfile = { id: 'admin-1', handle: 'boss', role: 'admin' } as unknown as Profile;

describe('POST /api/admin/calibrate — admin-only human anchor scores', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('400 on a non-JSON body', async () => {
    expect((await POST(makeBadRequest())).status).toBe(400);
  });

  it('422 on invalid input (empty criteria)', async () => {
    const res = await POST(makeRequest({ performanceId: PERF, criteria: {} }));
    expect(res.status).toBe(422);
  });

  it('403 when unauthenticated (no request context)', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(null);
    expect((await POST(makeRequest(validBody))).status).toBe(403);
  });

  it('403 when the caller is not an admin (and writes nothing)', async () => {
    const { ctx, insert } = makeCtx();
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(getProfileForContext).mockResolvedValue({
      id: 'u',
      handle: 'u',
      role: 'user',
    } as unknown as Profile);
    expect((await POST(makeRequest(validBody))).status).toBe(403);
    expect(insert).not.toHaveBeenCalled();
  });

  it('500 when the insert fails', async () => {
    const { ctx } = makeCtx({ insertError: { message: 'boom' } });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(getProfileForContext).mockResolvedValue(adminProfile);
    expect((await POST(makeRequest(validBody))).status).toBe(500);
  });

  it('201, stamping the row with the ADMIN id from the session (not the body)', async () => {
    const { ctx, insert } = makeCtx();
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(getProfileForContext).mockResolvedValue(adminProfile);

    const res = await POST(makeRequest({ ...validBody, adminId: 'spoofed' }));

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({ ok: true });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        performance_id: PERF,
        admin_id: 'admin-1',
        criteria: { vocalAccuracy: 80 },
      }),
    );
  });
});
