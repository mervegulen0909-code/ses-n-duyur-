import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// getRequestContext resolves the request's authed user (cookie OR bearer); the
// service client performs the privileged auth.admin.deleteUser cascade.
vi.mock('@/lib/supabase/server', () => ({
  getRequestContext: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}));

// Rate-limit passes by default (null = not blocked); one test overrides it.
vi.mock('@/lib/guard', () => ({
  rateLimit: vi.fn(async () => null),
}));

import { rateLimit } from '@/lib/guard';
import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { POST } from './route';

function makeRequest(body: unknown = {}): Request {
  return new Request('http://localhost/api/account/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

type RequestCtx = Awaited<ReturnType<typeof getRequestContext>>;
type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

function makeCtx(userId = 'user-1') {
  return { supabase: {}, user: { id: userId } } as unknown as RequestCtx;
}

// Service client exposing the two things the route uses: an auth.admin.deleteUser
// and a ratings_audit insert. `from` is a spy so a test can assert the audit write.
function makeService(opts: { deleteError?: unknown; auditError?: unknown } = {}) {
  const deleteUser = vi.fn(async () => ({ data: {}, error: opts.deleteError ?? null }));
  const insert = vi.fn(async () => ({ error: opts.auditError ?? null }));
  const from = vi.fn(() => ({ insert }));
  const client = { auth: { admin: { deleteUser } }, from } as unknown as ServiceClient;
  return { client, deleteUser, insert, from };
}

describe('POST /api/account/delete — store-required, self-only deletion', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('returns 401 and deletes nothing when the request is not authenticated', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(null);
    const service = makeService();
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.client);

    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    expect(service.deleteUser).not.toHaveBeenCalled();
  });

  it('returns 429 (rate-limited) and deletes nothing', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(makeCtx());
    vi.mocked(rateLimit).mockResolvedValueOnce(
      Response.json({ error: 'Too many requests' }, { status: 429 }),
    );
    const service = makeService();
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.client);

    const res = await POST(makeRequest());

    expect(res.status).toBe(429);
    expect(service.deleteUser).not.toHaveBeenCalled();
  });

  it('returns 503 when the service role is unavailable (deletes nothing)', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(makeCtx());
    vi.mocked(createSupabaseServiceClient).mockReturnValue(null);

    const res = await POST(makeRequest());

    expect(res.status).toBe(503);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('returns 500 when the deleteUser cascade fails', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(makeCtx());
    const service = makeService({ deleteError: { message: 'boom' } });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.client);

    const res = await POST(makeRequest());

    expect(res.status).toBe(500);
    expect(service.deleteUser).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('deletes the AUTHENTICATED user (from the session, NOT the body) on success', async () => {
    // IDOR guard: even when the body names a different victim, the route deletes
    // only the session user. This is the core authorization invariant.
    vi.mocked(getRequestContext).mockResolvedValue(makeCtx('me-real'));
    const service = makeService();
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.client);

    const res = await POST(makeRequest({ userId: 'someone-else', id: 'admin-victim' }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(service.deleteUser).toHaveBeenCalledTimes(1);
    expect(service.deleteUser).toHaveBeenCalledWith('me-real'); // never 'someone-else'
    // Audit row written for the same self id, de-identified survivor of the cascade.
    expect(service.from).toHaveBeenCalledWith('ratings_audit');
    expect(service.insert).toHaveBeenCalledWith(
      expect.objectContaining({ actor: 'me-real', action: 'account_deleted' }),
    );
  });

  it('still deletes the account when the best-effort audit write fails', async () => {
    // Right-to-erasure must never be blocked by an audit failure.
    vi.mocked(getRequestContext).mockResolvedValue(makeCtx('me-real'));
    const service = makeService({ auditError: { message: 'audit boom' } });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(service.client);

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(service.deleteUser).toHaveBeenCalledWith('me-real');
    expect(errorSpy).toHaveBeenCalled(); // audit failure logged...
  });
});
