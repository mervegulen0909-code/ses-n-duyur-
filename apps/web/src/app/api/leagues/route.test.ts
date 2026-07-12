import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServiceClient: vi.fn(),
  getRequestContext: vi.fn(),
}));
vi.mock('@/lib/guard', () => ({
  rateLimit: vi.fn(async () => null),
  botGuard: vi.fn(async () => null),
}));

import { createSupabaseServiceClient, getRequestContext } from '@/lib/supabase/server';
import { generateJoinCode, GET, POST } from './route';

function req(body: unknown): Request {
  return new Request('http://localhost/api/leagues', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/leagues', () => {
  afterEach(() => vi.clearAllMocks());

  it('generates an unambiguous 8-character code', () => {
    expect(generateJoinCode()).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });

  it('requires auth and validates the name', async () => {
    expect((await POST(req({ name: 'x' }))).status).toBe(422);
    vi.mocked(getRequestContext).mockResolvedValue(null);
    expect((await POST(req({ name: 'Choir crew' }))).status).toBe(401);
  });

  it('creates the league and owner membership atomically', async () => {
    vi.mocked(getRequestContext).mockResolvedValue({ user: { id: 'owner-1' } } as never);
    const rpc = vi.fn(async () => ({ data: 'league-1', error: null }));
    vi.mocked(createSupabaseServiceClient).mockReturnValue({ rpc } as never);

    const res = await POST(req({ name: 'Choir crew' }));

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      id: 'league-1',
      joinCode: expect.stringMatching(/^[A-HJ-NP-Z2-9]{8}$/),
    });
    expect(rpc).toHaveBeenCalledWith(
      'create_custom_league_atomic',
      expect.objectContaining({ p_owner_id: 'owner-1', p_name: 'Choir crew' }),
    );
  });

  it('returns 409 when the DB-enforced ownership limit is reached', async () => {
    vi.mocked(getRequestContext).mockResolvedValue({ user: { id: 'owner-1' } } as never);
    vi.mocked(createSupabaseServiceClient).mockReturnValue({
      rpc: async () => ({ data: null, error: { message: 'league_limit' } }),
    } as never);
    expect((await POST(req({ name: 'Fourth league' }))).status).toBe(409);
  });
});

describe('GET /api/leagues', () => {
  afterEach(() => vi.clearAllMocks());

  it('returns only leagues belonging to the signed-in member', async () => {
    vi.mocked(getRequestContext).mockResolvedValue({ user: { id: 'user-1' } } as never);
    vi.mocked(createSupabaseServiceClient).mockReturnValue({
      from: (table: string) =>
        table === 'custom_league_members'
          ? {
              select: () => ({
                eq: () => ({
                  order: async () => ({
                    data: [{ league_id: 'league-1', joined_at: '2026-01-01' }],
                    error: null,
                  }),
                }),
              }),
            }
          : {
              select: () => ({
                in: async () => ({
                  data: [{ id: 'league-1', name: 'Choir', owner_id: 'user-1' }],
                  error: null,
                }),
              }),
            },
    } as never);

    const res = await GET(new Request('http://localhost/api/leagues'));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      leagues: [{ id: 'league-1', name: 'Choir', isOwner: true }],
    });
  });
});
