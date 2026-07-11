import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  getRequestContext: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  getProfileForContext: vi.fn(),
}));

import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { getProfileForContext } from '@/lib/auth';
import { POST } from './route';

type RequestCtx = Awaited<ReturnType<typeof getRequestContext>>;
type Profile = Awaited<ReturnType<typeof getProfileForContext>>;
type Service = ReturnType<typeof createSupabaseServiceClient>;

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/admin/seasons', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeBadRequest(): Request {
  return new Request('http://localhost/api/admin/seasons', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: 'not json',
  });
}

const ctx = { supabase: {}, user: { id: 'admin-1' } } as unknown as RequestCtx;
const adminProfile = { id: 'admin-1', handle: 'boss', role: 'admin' } as unknown as Profile;

function makeService(
  opts: {
    closeError?: unknown;
    count?: number | null;
    insertData?: Record<string, unknown> | null;
    insertError?: unknown;
  } = {},
) {
  const closeEq = vi.fn(async () => ({ error: opts.closeError ?? null }));
  // .update({ ends_at }).is('ends_at', null) — closing the previous open season.
  const update = vi.fn(() => ({ is: closeEq }));

  // .select('id', { count: 'exact', head: true }) resolves directly (no chain).
  const countSelect = vi.fn(async () => ({ count: 'count' in opts ? opts.count : 0 }));

  const insertSingle = vi.fn(async () => ({
    data:
      'insertData' in opts
        ? opts.insertData
        : {
            id: 'season-1',
            key: 'S1-2026',
            title: 'Season 1',
            starts_at: '2026-01-01T00:00:00.000Z',
          },
    error: opts.insertError ?? null,
  }));
  const insert = vi.fn((_payload: Record<string, unknown>) => ({
    select: () => ({ single: insertSingle }),
  }));

  const from = vi.fn((table: string) => {
    if (table === 'seasons') return { update, select: countSelect, insert };
    throw new Error(`unexpected table ${table}`);
  });

  return {
    service: { from } as unknown as Service,
    update,
    closeEq,
    countSelect,
    insert,
    insertSingle,
  };
}

describe('POST /api/admin/seasons — open a new season, closing the current one', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('400 on a non-JSON body', async () => {
    expect((await POST(makeBadRequest())).status).toBe(400);
  });

  it('422 on invalid input (empty title)', async () => {
    expect((await POST(makeRequest({ title: '' }))).status).toBe(422);
  });

  it('403 when unauthenticated', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(null);
    expect((await POST(makeRequest({ title: 'Season 1' }))).status).toBe(403);
  });

  it('403 when the caller is not an admin', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(getProfileForContext).mockResolvedValue({
      id: 'u',
      handle: 'u',
      role: 'user',
    } as unknown as Profile);
    expect((await POST(makeRequest({ title: 'Season 1' }))).status).toBe(403);
    expect(createSupabaseServiceClient).not.toHaveBeenCalled();
  });

  it('503 when the service client is not configured', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(getProfileForContext).mockResolvedValue(adminProfile);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(null);
    expect((await POST(makeRequest({ title: 'Season 1' }))).status).toBe(503);
  });

  it('500 when closing the previous open season fails (and never attempts the insert)', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(getProfileForContext).mockResolvedValue(adminProfile);
    const svc = makeService({ closeError: { message: 'boom' } });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    const res = await POST(makeRequest({ title: 'Season 1' }));

    expect(res.status).toBe(500);
    expect(svc.insert).not.toHaveBeenCalled();
  });

  it('409 when the generated key collides with an existing season', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(getProfileForContext).mockResolvedValue(adminProfile);
    const svc = makeService({ insertData: null, insertError: { code: '23505' } });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    expect((await POST(makeRequest({ title: 'Season 1' }))).status).toBe(409);
  });

  it('500 on any other insert failure', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(getProfileForContext).mockResolvedValue(adminProfile);
    const svc = makeService({ insertData: null, insertError: { message: 'boom' } });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    expect((await POST(makeRequest({ title: 'Season 1' }))).status).toBe(500);
  });

  it('201: closes the previous open season and opens a new one with a generated key', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(getProfileForContext).mockResolvedValue(adminProfile);
    const svc = makeService({ count: 3 });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    const res = await POST(
      makeRequest({ title: 'Season 4', startsAt: '2027-03-01T00:00:00.000Z' }),
    );

    expect(res.status).toBe(201);
    expect(svc.update).toHaveBeenCalledWith(
      expect.objectContaining({ ends_at: expect.any(String) }),
    );
    expect(svc.closeEq).toHaveBeenCalledWith('ends_at', null);
    // count is 3 existing seasons -> the 4th one, year taken from the given startsAt.
    expect(svc.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'S4-2027',
        title: 'Season 4',
        starts_at: '2027-03-01T00:00:00.000Z',
        ends_at: null,
      }),
    );
    await expect(res.json()).resolves.toMatchObject({ id: 'season-1', key: 'S1-2026' });
  });

  it('defaults startsAt to now when omitted', async () => {
    vi.mocked(getRequestContext).mockResolvedValue(ctx);
    vi.mocked(getProfileForContext).mockResolvedValue(adminProfile);
    const svc = makeService({ count: 0 });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc.service);

    const res = await POST(makeRequest({ title: 'Season 1' }));

    expect(res.status).toBe(201);
    const call = svc.insert.mock.calls[0]?.[0];
    if (!call) throw new Error('insert was not called');
    expect(() => new Date(call.starts_at as string).toISOString()).not.toThrow();
    expect(call.key).toMatch(/^S1-\d{4}$/);
  });
});
