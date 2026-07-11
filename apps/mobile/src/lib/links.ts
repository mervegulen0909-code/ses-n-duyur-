// In-app legal links. Apple (5.1.1) and Google Play require the privacy policy
// and terms to be reachable from within the app; DMCA is our takedown path.
// WEB_BASE is single-sourced with the API base (lib/config.ts) so these
// store-required links can't drift to a stale deployment.
import { WEB_BASE } from './config';

// Labels are translation keys (see lib/i18n/locales/*.json → Legal.*), not
// display text — the destination pages themselves stay English (ADR 0002),
// but the in-app link label should still match the user's chosen language.
export const LEGAL_LINKS = [
  { labelKey: 'Legal.terms', url: `${WEB_BASE}/terms` },
  { labelKey: 'Legal.privacy', url: `${WEB_BASE}/privacy` },
  { labelKey: 'Legal.dmca', url: `${WEB_BASE}/dmca` },
] as const;
