'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { track } from '@/lib/analytics';
import { BattleArena } from './battle-arena';
import { GuestBattle } from './guest-battle';

interface Side {
  videoId: string;
  title: string;
}

export function ChallengeSection({
  songId,
  isSignedIn,
  guestPair = null,
}: {
  songId: string;
  isSignedIn: boolean;
  /** Top-two ranked performances — powers the signup-free teaser battle. */
  guestPair?: { a: Side; b: Side } | null;
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
      ) : guestPair ? (
        <GuestBattle
          a={guestPair.a}
          b={guestPair.b}
          loginNext={`/song/${songId}?challenge=1`}
          entry="challenge"
        />
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
