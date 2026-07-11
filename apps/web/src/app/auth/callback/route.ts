import { NextResponse } from 'next/server';
import { trackServer } from '@/lib/analytics-server';
import { grantBadge } from '@/lib/badges';
import {
  cookieValue,
  INVITER_BADGE_THRESHOLD,
  isNewUser,
  isValidRefCode,
  REF_COOKIE,
} from '@/lib/referral';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server';

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

/**
 * Server-side referral attribution — the only path that survives the OAuth
 * redirect chain (client-side `track()` never runs mid-redirect). Best-effort:
 * a failure here must never break sign-in.
 */
async function attributeReferral(request: Request, userId: string, createdAt?: string) {
  try {
    const ref = cookieValue(request.headers.get('cookie'), REF_COOKIE);
    if (!isValidRefCode(ref) || ref === userId) return;
    if (!isNewUser(createdAt, new Date())) return; // returning login, not a conversion

    const service = createSupabaseServiceClient();
    if (!service) return;

    await trackServer(service, 'invite_converted', userId, { ref });

    // Badge at N conversions — count is server-derived, never client-supplied.
    const { count } = await service
      .from('analytics_events')
      .select('id', { count: 'exact', head: true })
      .eq('event', 'invite_converted')
      .eq('meta->>ref', ref);
    if ((count ?? 0) >= INVITER_BADGE_THRESHOLD) {
      await grantBadge(service, ref, 'inviter');
    }
  } catch {
    // Attribution is best-effort by design.
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeNext(searchParams.get('next') ?? '/');

  if (code) {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) await attributeReferral(request, user.id, user.created_at);

        const res = NextResponse.redirect(`${origin}${next}`);
        res.cookies.set(REF_COOKIE, '', { maxAge: 0, path: '/' });
        return res;
      }
    }
  }
  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
