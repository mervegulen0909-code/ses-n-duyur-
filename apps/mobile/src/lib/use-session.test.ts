import { describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';

// watchAuthSession takes its auth source as an argument, but importing the
// module still evaluates its top-level `import { supabase } from './supabase'`,
// which pulls in expo-secure-store and other native modules. Stub it (as
// api.test.ts does) so this pure-logic test runs in the node env.
vi.mock('./supabase', () => ({ supabase: { auth: { onAuthStateChange: vi.fn() } } }));

import { watchAuthSession } from './use-session';

/** A fake `supabase.auth` that lets a test drive onAuthStateChange manually. */
function fakeAuth() {
  let handler: ((event: string, session: Session | null) => void) | null = null;
  const unsubscribe = vi.fn();
  return {
    auth: {
      onAuthStateChange(cb: (event: string, session: Session | null) => void) {
        handler = cb;
        return { data: { subscription: { unsubscribe } } };
      },
    },
    emit(event: string, session: Session | null) {
      handler?.(event, session);
    },
    unsubscribe,
  };
}

const session = { access_token: 'a', user: { id: 'u1' } } as unknown as Session;

describe('watchAuthSession', () => {
  it('reports the INITIAL_SESSION event (a signed-in cold start restores the user)', () => {
    const onChange = vi.fn();
    const fake = fakeAuth();
    watchAuthSession(fake.auth, onChange);

    // Supabase emits INITIAL_SESSION once the encrypted store is restored.
    fake.emit('INITIAL_SESSION', session);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(session);
  });

  it('reports a null INITIAL_SESSION (genuinely signed out) without hanging', () => {
    const onChange = vi.fn();
    const fake = fakeAuth();
    watchAuthSession(fake.auth, onChange);

    fake.emit('INITIAL_SESSION', null);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('keeps reporting later sign-in / sign-out / token-refresh events', () => {
    const onChange = vi.fn();
    const fake = fakeAuth();
    watchAuthSession(fake.auth, onChange);

    fake.emit('INITIAL_SESSION', null);
    fake.emit('SIGNED_IN', session);
    fake.emit('TOKEN_REFRESHED', session);
    fake.emit('SIGNED_OUT', null);

    expect(onChange.mock.calls.map((c) => c[0])).toEqual([null, session, session, null]);
  });

  it('unsubscribes on teardown', () => {
    const fake = fakeAuth();
    const stop = watchAuthSession(fake.auth, vi.fn());
    expect(fake.unsubscribe).not.toHaveBeenCalled();
    stop();
    expect(fake.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
