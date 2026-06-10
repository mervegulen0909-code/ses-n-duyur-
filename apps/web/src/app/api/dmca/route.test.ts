import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Public DMCA filing: no auth. Uses the plain server client (RLS dmca_insert_any),
// which is null when Supabase is not configured.
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { POST } from './route';

const PERF = '11111111-1111-1111-1111-111111111111';

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/dmca', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeBadRequest(): Request {
  return new Request('http://localhost/api/dmca', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: 'not json',
  });
}

function makeClient(opts: { insertError?: unknown } = {}) {
  const insert = vi.fn(async () => ({ error: opts.insertError ?? null }));
  const from = vi.fn(() => ({ insert }));
  return { client: { from } as unknown as ServerClient, insert };
}

describe('POST /api/dmca — public takedown filing', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('400 on a non-JSON body', async () => {
    expect((await POST(makeBadRequest())).status).toBe(400);
  });

  it('422 on invalid input (claimant too short)', async () => {
    expect((await POST(makeRequest({ claimant: 'x' }))).status).toBe(422);
  });

  it('503 when Supabase is not configured', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(null);
    expect((await POST(makeRequest({ claimant: 'Acme Records' }))).status).toBe(503);
  });

  it('500 when the insert fails', async () => {
    const { client } = makeClient({ insertError: { message: 'boom' } });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client);
    expect((await POST(makeRequest({ claimant: 'Acme Records' }))).status).toBe(500);
  });

  it('201 on a minimal filing, defaulting the optional fields to null', async () => {
    const { client, insert } = makeClient();
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client);

    const res = await POST(makeRequest({ claimant: 'Acme Records' }));

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({ ok: true });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        performance_id: null,
        claimant: 'Acme Records',
        details: null,
      }),
    );
  });

  it('201 carrying through the performance id and details when supplied', async () => {
    const { client, insert } = makeClient();
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client);

    const res = await POST(
      makeRequest({ performanceId: PERF, claimant: 'Acme Records', details: 'Our master.' }),
    );

    expect(res.status).toBe(201);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        performance_id: PERF,
        claimant: 'Acme Records',
        details: 'Our master.',
      }),
    );
  });
});
