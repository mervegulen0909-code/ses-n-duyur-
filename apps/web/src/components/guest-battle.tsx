'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { track } from '@/lib/analytics';
import { YouTubePlayer } from './youtube-player';

interface Side {
  videoId: string;
  title: string;
}

/**
 * The signup-free battle teaser (onboarding <60s + challenge landing).
 * Both players must reach ENDED before the winner buttons route to login.
 * This is a local teaser only — no listen sessions, no votes, no writes;
 * hard rules 4/5 stay enforced server-side for the real flow after login.
 */
export function GuestBattle({
  a,
  b,
  loginNext,
  entry,
}: {
  a: Side;
  b: Side;
  loginNext: string;
  entry: string; // analytics meta: 'home' | 'challenge'
}) {
  const router = useRouter();
  const t = useTranslations('Battle');
  const [doneA, setDoneA] = useState(false);
  const [doneB, setDoneB] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (entry === 'challenge') track('challenge_link_visited', { entry });
  }, [entry]);

  function onFirstStart() {
    if (startedRef.current) return;
    startedRef.current = true;
    track('guest_battle_started', { entry });
  }

  const both = doneA && doneB;
  const toLogin = () => router.push(`/login?next=${encodeURIComponent(loginNext)}`);

  return (
    <div className="space-y-4">
      <div className="grid gap-6 sm:grid-cols-2">
        {[
          { side: a, done: doneA, setDone: setDoneA },
          { side: b, done: doneB, setDone: setDoneB },
        ].map(({ side, done, setDone }) => (
          <div key={side.videoId} className="space-y-2">
            <h3 className="truncate text-sm font-semibold">{side.title}</h3>
            <YouTubePlayer
              videoId={side.videoId}
              onStart={onFirstStart}
              onComplete={() => setDone(true)}
            />
            <p className={`text-xs ${done ? 'text-emerald-400' : 'text-neutral-500'}`}>
              {done ? t('guestListened') : t('guestWatchBoth')}
            </p>
          </div>
        ))}
      </div>
      <button
        type="button"
        disabled={!both}
        onClick={toLogin}
        className="w-full rounded-lg bg-emerald-600 px-4 py-3 font-medium text-white disabled:opacity-40"
      >
        {t('guestPickCta')}
      </button>
    </div>
  );
}
