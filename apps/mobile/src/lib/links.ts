// Web origin that hosts the legal pages — the same host the API lives on
// (see lib/api.ts). Override with EXPO_PUBLIC_API_BASE_URL for local/staging.
const WEB_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://ses-n-duyur-web.vercel.app';

// In-app legal links. Apple (5.1.1) and Google Play require the privacy policy
// and terms to be reachable from within the app; DMCA is our takedown path.
export const LEGAL_LINKS = [
  { label: 'Terms of Service', url: `${WEB_BASE}/terms` },
  { label: 'Privacy Policy', url: `${WEB_BASE}/privacy` },
  { label: 'DMCA / Takedown', url: `${WEB_BASE}/dmca` },
] as const;
