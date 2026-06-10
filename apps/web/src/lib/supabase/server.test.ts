import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mocked client factories (hoisted above imports by Vitest) --------------
//
// getRequestContext composes two real factories — createSupabaseServerClient
// (cookie session, via @supabase/ssr) and a token-scoped createClient
// (@supabase/supabase-js). We stub BOTH at the SDK boundary and drive whether
// each one's auth.getUser() resolves to a user via mutable hoisted state, so a
// test can prove exactly when a context is (and is NOT) returned.
//
// vi.mock is hoisted above this file's top-level code, so the controllable
// state + spies must live in vi.hoisted() to be reachable from the factories.
const h = vi.hoisted(() => {
  const state = {
    cookieUser: null as { id: string } | null,
    tokenUser: null as { id: string } | null,
  };
  const cookieGetUser = vi.fn(async () => ({ data: { user: state.cookieUser } }));
  const tokenGetUser = vi.fn(async () => ({ data: { user: state.tokenUser } }));
  // Each factory returns a stable, identity-comparable client object.
  const createServerClient = vi.fn(() => ({ auth: { getUser: cookieGetUser } }));
  const createClient = vi.fn(() => ({ auth: { getUser: tokenGetUser } }));
  return { state, cookieGetUser, tokenGetUser, createServerClient, createClient };
});

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })),
}));
vi.mock('@supabase/ssr', () => ({ createServerClient: h.createServerClient }));
vi.mock('@supabase/supabase-js', () => ({ createClient: h.createClient }));

import { getRequestContext } from './server';

const URL = 'https://test.supabase.co';
const ANON = 'anon-test-key';

/** Build a bare POST-like request, optionally carrying an Authorization header. */
function req(authHeader?: string): Request {
  return new Request('http://localhost/api/x', {
    method: 'POST',
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

describe('getRequestContext — additive cookie+bearer auth without weakening it', () => {
  beforeEach(() => {
    h.state.cookieUser = null;
    h.state.tokenUser = null;
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ANON;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when there is no cookie session and no Authorization header', async () => {
    const ctx = await getRequestContext(req());

    expect(ctx).toBeNull();
    // No token to validate → the bearer client is never even constructed.
    expect(h.createClient).not.toHaveBeenCalled();
  });

  it('returns null for a malformed Authorization header (never builds a token client)', async () => {
    for (const bad of ['Bearer ', 'Bearer', 'Basic abc123', 'token xyz', 'Bearer   ']) {
      vi.clearAllMocks();
      const ctx = await getRequestContext(req(bad));
      expect(ctx, `header: ${JSON.stringify(bad)}`).toBeNull();
      expect(h.createClient, `header: ${JSON.stringify(bad)}`).not.toHaveBeenCalled();
    }
  });

  it('returns null for a Bearer token that Supabase rejects (forged/expired/anon)', async () => {
    // A token IS present and a token-scoped client IS built — but auth.getUser()
    // resolves to {user:null}, so the token is NEVER trusted. This is the core
    // security guarantee: a user is only returned AFTER Supabase verifies the JWT.
    h.state.tokenUser = null;

    const ctx = await getRequestContext(req('Bearer forged.jwt.value'));

    expect(ctx).toBeNull();
    expect(h.createClient).toHaveBeenCalledTimes(1); // client built...
    expect(h.tokenGetUser).toHaveBeenCalledTimes(1); // ...JWT validation attempted...
    // ...and no context returned because validation yielded no user.
  });

  it('returns the token-scoped client + user for a valid Bearer token', async () => {
    h.state.tokenUser = { id: 'user-mobile' };

    const ctx = await getRequestContext(req('Bearer good.jwt.value'));

    expect(ctx).not.toBeNull();
    expect(ctx?.user.id).toBe('user-mobile');
    // The returned client is the token-scoped one, so RLS applies as that user.
    expect(ctx?.supabase).toBe(h.createClient.mock.results[0]?.value);
    // The JWT rides in the client's global Authorization header (RLS-as-user).
    expect(h.createClient).toHaveBeenCalledWith(
      URL,
      ANON,
      expect.objectContaining({
        global: { headers: { Authorization: 'Bearer good.jwt.value' } },
      }),
    );
  });

  it('prefers the cookie session and never reads the bearer token when a cookie user exists', async () => {
    // Web path stays byte-for-byte: cookie session wins and short-circuits BEFORE
    // the Authorization header is ever read — even if a bearer header is present.
    h.state.cookieUser = { id: 'user-web' };
    h.state.tokenUser = { id: 'should-be-ignored' };

    const ctx = await getRequestContext(req('Bearer present.but.ignored'));

    expect(ctx?.user.id).toBe('user-web');
    expect(ctx?.supabase).toBe(h.createServerClient.mock.results[0]?.value);
    expect(h.createClient).not.toHaveBeenCalled(); // token branch unreachable
  });

  it('returns null without building any client when Supabase env is unconfigured', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const ctx = await getRequestContext(req('Bearer any.token'));

    expect(ctx).toBeNull();
    expect(h.createServerClient).not.toHaveBeenCalled();
    expect(h.createClient).not.toHaveBeenCalled();
  });
});
