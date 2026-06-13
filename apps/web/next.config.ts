import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// Wires next-intl's request config (locale + messages) into the build. The app
// uses cookie-based locale (no i18n routing), so no middleware/route changes.
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// CSP tuned for: YouTube IFrame embed + API, Supabase (local + cloud, incl. ws
// for Realtime), YouTube thumbnails, and Cloudflare Turnstile (bot check — its
// api.js script + challenge iframe load from challenges.cloudflare.com).
// Tighten further before production.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com https://s.ytimg.com https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://i.ytimg.com https://*.ytimg.com",
  'frame-src https://www.youtube.com https://www.youtube-nocookie.com https://challenges.cloudflare.com',
  "connect-src 'self' http://127.0.0.1:54321 ws://127.0.0.1:54321 https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com",
  "font-src 'self' data:",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
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
