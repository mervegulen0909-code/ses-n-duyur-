import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * OAuth (Google) callback. Supabase redirects here with `?code=…` after the user
 * authorizes. We exchange that code for a session cookie (PKCE — the verifier
 * cookie was set by the browser client during signInWithOAuth), then send the
 * user on. On any failure we bounce back to /login.
 */
/**
 * Only honor same-origin, absolute in-app paths for `next`. Rejects open-redirect
 * payloads like `@evil.com` (becomes userinfo → host evil.com), `//evil.com` and
 * `/\evil.com` (protocol-relative). Falls back to the home page otherwise.
 */
function safeNext(next: string): string {
  return next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/';
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeNext(searchParams.get('next') ?? '/');

  if (code) {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
