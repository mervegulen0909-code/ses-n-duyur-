import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { buildCsp } from '@/lib/security-headers';

export async function middleware(request: NextRequest) {
  // Fresh per-request nonce so the CSP can drop 'unsafe-inline'/'unsafe-eval'.
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce, process.env.NODE_ENV !== 'production');

  // Forward the nonce + CSP on the REQUEST so Next.js stamps the nonce onto its
  // own inline/bootstrap scripts (it reads them from these request headers).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  // Refresh the Supabase session (forwarding the request headers), then attach
  // the CSP to the response as well.
  const response = await updateSession(request, requestHeaders);
  response.headers.set('content-security-policy', csp);
  return response;
}

export const config = {
  // Run on all routes except static assets and image optimization.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
