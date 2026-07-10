/**
 * Canonical public origin for absolute URLs (OpenGraph, canonical links,
 * robots/sitemap). Override per environment with NEXT_PUBLIC_SITE_URL; falls
 * back to the current production alias. No trailing slash.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://web-seven-coral-88.vercel.app'
).replace(/\/$/, '');
