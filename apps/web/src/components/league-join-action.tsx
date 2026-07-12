'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TurnstileWidget } from './turnstile-widget';
import { track } from '@/lib/analytics';

export function LeagueJoinAction({ code }: { code: string }) {
  const t = useTranslations('Leagues');
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function join() {
    setBusy(true);
    setError('');
    const response = await fetch('/api/leagues/join', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { 'x-turnstile-token': token } : {}),
      },
      body: JSON.stringify({ code }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      leagueId?: string;
      error?: string;
    };
    if (response.ok && result.leagueId) {
      track('invite_converted', { leagueId: result.leagueId });
      router.replace(`/leagues/${result.leagueId}`);
      return;
    }
    setError(result.error ?? t('genericError'));
    setBusy(false);
  }

  return (
    <div className="mt-6">
      <TurnstileWidget onToken={setToken} />
      <button
        type="button"
        disabled={busy}
        onClick={() => void join()}
        className="rounded-xl bg-emerald-400 px-5 py-3 font-bold text-emerald-950 disabled:opacity-50"
      >
        {busy ? t('working') : t('acceptInvite')}
      </button>
      {error && (
        <p role="alert" className="mt-3 text-sm text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}
