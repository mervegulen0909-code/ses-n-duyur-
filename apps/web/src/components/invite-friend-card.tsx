'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { track } from '@/lib/analytics';
import { SITE_URL } from '@/lib/site';

/** Home-page CTA card: copies the site link and fires `share_clicked`. */
export function InviteFriendCard() {
  const t = useTranslations();
  const [copied, setCopied] = useState(false);

  async function invite() {
    track('share_clicked', { channel: 'invite_card' });
    try {
      await navigator.clipboard.writeText(SITE_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied — the card still communicates the CTA.
    }
  }

  return (
    <button
      type="button"
      onClick={invite}
      className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5 text-left hover:border-neutral-600"
    >
      <div className="font-semibold">{t('Home.ctaInviteTitle')}</div>
      <div className="mt-1 text-sm text-neutral-500">{t('Home.ctaInviteBody')}</div>
      {copied && <div className="mt-1 text-xs text-emerald-400">{t('Performance.linkCopied')}</div>}
    </button>
  );
}
