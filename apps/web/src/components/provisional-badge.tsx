'use client';

import { useTranslations } from 'next-intl';

/**
 * "Provisional AI Estimate" badge. Required wherever an MVP AI score from
 * YouTube content is shown — it is never a real audio measurement. Client
 * component so it can translate via the shared NextIntlClientProvider, whether
 * rendered from a Server Component (home/leaderboard) or a Client one.
 */
export function ProvisionalBadge() {
  const t = useTranslations('Common');
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-300"
      title={t('provisionalBadgeTitle')}
    >
      {t('provisionalBadge')}
    </span>
  );
}
