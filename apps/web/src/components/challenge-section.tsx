'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { track } from '@/lib/analytics';
import { BattleArena } from './battle-arena';

export function ChallengeSection({
  songId,
  isSignedIn,
}: {
  songId: string;
  isSignedIn: boolean;
}) {
  const t = useTranslations();

  // Fires once per mount — re-firing on every render would inflate the
  // funnel count for a single visit.
  useEffect(() => {
    track('challenge_opened', { songId });
  }, [songId]);

  return (
    <section className="rounded-xl border border-emerald-800/50 bg-emerald-500/5 p-5">
      <h2 className="mb-3 text-lg font-semibold">{t('Song.challengeCta')}</h2>
      {isSignedIn ? (
        <BattleArena songId={songId} />
      ) : (
        <p className="text-sm text-neutral-400">
          {t.rich('Battle.signInPrompt', {
            link: (chunks) => (
              <Link href="/login" className="font-medium text-emerald-400">
                {chunks}
              </Link>
            ),
          })}
        </p>
      )}
    </section>
  );
}
