/**
 * Content-Security-Policy builder. Emitted per-request from middleware so each
 * response carries a fresh nonce — this lets us drop 'unsafe-inline'/'unsafe-eval'
 * from script-src (the dev-grade allowances that neuter a CSP). Next.js reads the
 * nonce from the request CSP header and stamps it onto its own inline/bootstrap
 * scripts; `'strict-dynamic'` then trusts scripts those load (e.g. the Turnstile
 * api.js the widget injects), so no host allowlist is needed for scripts.
 *
 * Tuned for: YouTube IFrame embed (frame), Supabase (cloud + local dev incl. ws
 * for Realtime), YouTube thumbnails, and Cloudflare Turnstile.
 */
export function buildCsp(nonce: string, isDev: boolean): string {
  const connectSrc = [
    "'self'",
    // Local Supabase stack — dev only; never advertised in production responses.
    ...(isDev ? ['http://127.0.0.1:54321', 'ws://127.0.0.1:54321'] : []),
    'https://*.supabase.co',
    'wss://*.supabase.co',
    'https://challenges.cloudflare.com',
  ];

  // 'unsafe-eval' is required ONLY in dev (Next.js HMR / React Refresh use eval);
  // production never ships it. 'strict-dynamic' does not affect eval, so HMR works.
  const devEval = isDev ? " 'unsafe-eval'" : '';

  return [
    "default-src 'self'",
    // 'strict-dynamic' + nonce is the real policy in modern browsers; the host
    // sources are a CSP2 fallback for browsers that ignore strict-dynamic.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${devEval} https://www.youtube.com https://s.ytimg.com https://challenges.cloudflare.com`,
    // Inline styles stay allowed: Tailwind/Next inject them and nonces don't apply.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://i.ytimg.com https://*.ytimg.com",
    'frame-src https://www.youtube.com https://www.youtube-nocookie.com https://challenges.cloudflare.com',
    `connect-src ${connectSrc.join(' ')}`,
    "font-src 'self' data:",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "object-src 'none'",
  ].join('; ');
}
