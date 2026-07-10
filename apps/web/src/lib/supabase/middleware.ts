import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseEnv } from '../env';

/**
 * Refreshes the Supabase auth session on every request and forwards the updated
 * cookies. No-op when Supabase env is not configured (dev-safe).
 *
 * `requestHeaders` (when provided) are forwarded onto the request so Next.js can
 * read the per-request CSP nonce the middleware set — see middleware.ts.
 */
export async function updateSession(
  request: NextRequest,
  requestHeaders?: Headers,
): Promise<NextResponse> {
  const init = requestHeaders ? { request: { headers: requestHeaders } } : { request };
  let response = NextResponse.next(init);

  const env = getSupabaseEnv();
  if (!env) return response;

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next(init);
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Touch the session so expired tokens get refreshed into the response cookies.
  await supabase.auth.getUser();
  return response;
}
