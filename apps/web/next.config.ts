import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// Wires next-intl's request config (locale + messages) into the build. The app
// uses cookie-based locale (no i18n routing), so no middleware/route changes.
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Static security headers applied to every response. The Content-Security-Policy
// is NOT here — it is emitted per-request from middleware.ts with a fresh nonce
// (so script-src can drop 'unsafe-inline'/'unsafe-eval'). See lib/security-headers.ts.
const securityHeaders = [
  // HSTS: force HTTPS for 2 years incl. subdomains (Vercel terminates TLS but
  // does not inject this). `preload` is eligible once the commitment is firm.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
