// In-app legal links. Apple (5.1.1) and Google Play require the privacy policy
// and terms to be reachable from within the app; DMCA is our takedown path.
// WEB_BASE is single-sourced with the API base (lib/config.ts) so these
// store-required links can't drift to a stale deployment.
import { WEB_BASE } from './config';

export const LEGAL_LINKS = [
  { label: 'Terms of Service', url: `${WEB_BASE}/terms` },
  { label: 'Privacy Policy', url: `${WEB_BASE}/privacy` },
  { label: 'DMCA / Takedown', url: `${WEB_BASE}/dmca` },
] as const;
