import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Admin DMCA resolution: gated on getRequestContext + an admin profile, then a
// status update and — only on a takedown — removal of the named performance.
vi.mock('@/lib/supabase/server', () => ({
  getRequestContext: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  getProfileForContext: vi.fn(),
}));

import { getProfileForContext } from '@/lib/auth';
import { getRequestContext } from '@/lib/supabase/server';
import { POST } from './route';

const REQ = '11111111-1111-1111-1111-111111111111';
const PERF = '22222222-2222-2222-2222-222222222222';

type RequestCtx = Awaited<ReturnType<typeof getRequestContext>>;
type Profile = Awaited<ReturnType<typeof getProfileForContext>>;

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/admin/dmca', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeBadRequest(): Request {
  return new Request('http://localhost/api/admin/dmca', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: 'not json',
  });
}

// RLS-scoped client. Spies on both the dmca_requests update and the conditional
// performances removal, and records which row id each update was scoped to.
function makeCtx(opts: { updateError?: unknown } = {}) {
  const dmcaEq = vi.fn(async () => ({ error: opts.updateError ?? null }));
  const perfEq = vi.fn(async () => ({ error: null }));
  const dmcaUpdate = vi.fn(() => ({ eq: dmcaEq }));
  const perfUpdate = vi.fn(() => ({ eq: perfEq }));
  const from = vi.fn((table: string) => {
    if (table === 'dmca_requests') return { update: dmcaUpdate };
    if (table === 'performances') return { update: perfUpdate };
    return {};
  });
  return {
    ctx: { supabase: { from }, user: { id: 'me' } } as unknown as RequestCtx,
    dmcaUpdate,
    perfUpdate,
  };
}

const adminProfile = { id: 'admin-1', handle: 'boss', role: 'admin' } as unknown as Profile;

describe('POST /api/admin/dmca — admin-only takedown resolution', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('400 on a non-JSON body', async () => {
    expect((await POST(makeBadRequest())).status).toBe(400);
  });

  it('422 on invalid input (bad status)', async () => {
    expect((await POST(makeRequest({ requestId: REQ, status: 'maybe' }))).status).toBe(422);
  });

  it('403 when unauthenticated (no request context)', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(null);
    expect((await POST(makeRequest({ requestId: REQ, status: 'rejected' }))).status).toBe(403);
  });

  it('403 when the caller is not an admin (and updates nothing)', async () => {
    const { ctx, dmcaUpdate } = makeCtx();
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(getProfileForContext).mockResolvedValue({
      id: 'u',
      handle: 'u',
      role: 'user',
    } as unknown as Profile);
    expect((await POST(makeRequest({ requestId: REQ, status: 'actioned' }))).status).toBe(403);
    expect(dmcaUpdate).not.toHaveBeenCalled();
  });

  it('500 when the status update fails', async () => {
    const { ctx } = makeCtx({ updateError: { message: 'boom' } });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(getProfileForContext).mockResolvedValue(adminProfile);
    expect((await POST(makeRequest({ requestId: REQ, status: 'rejected' }))).status).toBe(500);
  });

  it('200 on a takedown — also removes the named performance from public view', async () => {
    const { ctx, dmcaUpdate, perfUpdate } = makeCtx();
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(getProfileForContext).mockResolvedValue(adminProfile);

    const res = await POST(
      makeRequest({ requestId: REQ, status: 'actioned', performanceId: PERF }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true });
    expect(dmcaUpdate).toHaveBeenCalledWith({ status: 'actioned' });
    expect(perfUpdate).toHaveBeenCalledWith({ status: 'removed' });
  });

  it('200 on rejection — leaves the performance untouched', async () => {
    const { ctx, perfUpdate } = makeCtx();
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(getProfileForContext).mockResolvedValue(adminProfile);

    const res = await POST(
      makeRequest({ requestId: REQ, status: 'rejected', performanceId: PERF }),
    );

    expect(res.status).toBe(200);
    expect(perfUpdate).not.toHaveBeenCalled();
  });

  it('200 on a takedown with no performanceId — nothing to remove', async () => {
    const { ctx, perfUpdate } = makeCtx();
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(getProfileForContext).mockResolvedValue(adminProfile);

    const res = await POST(makeRequest({ requestId: REQ, status: 'actioned' }));

    expect(res.status).toBe(200);
    expect(perfUpdate).not.toHaveBeenCalled();
  });
});
