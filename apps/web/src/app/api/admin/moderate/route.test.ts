import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Admin moderation: gated on getRequestContext + an admin profile, then a flag
// status update and — only when asked — hiding the named performance.
vi.mock('@/lib/supabase/server', () => ({
  getRequestContext: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  getProfileForContext: vi.fn(),
}));

import { getProfileForContext } from '@/lib/auth';
import { getRequestContext } from '@/lib/supabase/server';
import { POST } from './route';

const FLAG = '11111111-1111-1111-1111-111111111111';
const PERF = '22222222-2222-2222-2222-222222222222';

type RequestCtx = Awaited<ReturnType<typeof getRequestContext>>;
type Profile = Awaited<ReturnType<typeof getProfileForContext>>;

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/admin/moderate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeBadRequest(): Request {
  return new Request('http://localhost/api/admin/moderate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: 'not json',
  });
}

// RLS-scoped client. Spies on the moderation_flags update and the conditional
// performances hide.
function makeCtx(opts: { updateError?: unknown } = {}) {
  const flagEq = vi.fn(async () => ({ error: opts.updateError ?? null }));
  const perfEq = vi.fn(async () => ({ error: null }));
  const flagUpdate = vi.fn(() => ({ eq: flagEq }));
  const perfUpdate = vi.fn(() => ({ eq: perfEq }));
  const from = vi.fn((table: string) => {
    if (table === 'moderation_flags') return { update: flagUpdate };
    if (table === 'performances') return { update: perfUpdate };
    return {};
  });
  return {
    ctx: { supabase: { from }, user: { id: 'me' } } as unknown as RequestCtx,
    flagUpdate,
    perfUpdate,
  };
}

const adminProfile = { id: 'admin-1', handle: 'boss', role: 'admin' } as unknown as Profile;

describe('POST /api/admin/moderate — admin-only flag resolution', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('400 on a non-JSON body', async () => {
    expect((await POST(makeBadRequest())).status).toBe(400);
  });

  it('422 on invalid input (bad status)', async () => {
    expect((await POST(makeRequest({ flagId: FLAG, status: 'meh' }))).status).toBe(422);
  });

  it('403 when unauthenticated (no request context)', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(null);
    expect((await POST(makeRequest({ flagId: FLAG, status: 'resolved' }))).status).toBe(403);
  });

  it('403 when the caller is not an admin (and updates nothing)', async () => {
    const { ctx, flagUpdate } = makeCtx();
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(getProfileForContext).mockResolvedValue({
      id: 'u',
      handle: 'u',
      role: 'user',
    } as unknown as Profile);
    expect((await POST(makeRequest({ flagId: FLAG, status: 'resolved' }))).status).toBe(403);
    expect(flagUpdate).not.toHaveBeenCalled();
  });

  it('500 when the flag update fails', async () => {
    const { ctx } = makeCtx({ updateError: { message: 'boom' } });
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(getProfileForContext).mockResolvedValue(adminProfile);
    expect((await POST(makeRequest({ flagId: FLAG, status: 'resolved' }))).status).toBe(500);
  });

  it('200 and hides the performance when hidePerformanceId is supplied', async () => {
    const { ctx, flagUpdate, perfUpdate } = makeCtx();
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(getProfileForContext).mockResolvedValue(adminProfile);

    const res = await POST(
      makeRequest({ flagId: FLAG, status: 'resolved', hidePerformanceId: PERF }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true });
    expect(flagUpdate).toHaveBeenCalledWith({ status: 'resolved' });
    expect(perfUpdate).toHaveBeenCalledWith({ status: 'hidden' });
  });

  it('200 and leaves performances untouched when no hidePerformanceId', async () => {
    const { ctx, perfUpdate } = makeCtx();
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(getProfileForContext).mockResolvedValue(adminProfile);

    const res = await POST(makeRequest({ flagId: FLAG, status: 'dismissed' }));

    expect(res.status).toBe(200);
    expect(perfUpdate).not.toHaveBeenCalled();
  });
});
