'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TurnstileWidget } from './turnstile-widget';

export function LeagueForms() {
  const t = useTranslations('Leagues');
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [createToken, setCreateToken] = useState<string | null>(null);
  const [joinToken, setJoinToken] = useState<string | null>(null);
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState('');

  async function submit(
    path: string,
    body: unknown,
    token: string | null,
    kind: 'create' | 'join',
  ) {
    setBusy(kind);
    setError('');
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { 'x-turnstile-token': token } : {}),
        },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => ({}))) as {
        id?: string;
        leagueId?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? t('genericError'));
      router.push(`/leagues/${result.id ?? result.leagueId}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('genericError'));
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <form
        className="rounded-2xl border border-neutral-800 bg-neutral-900/45 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit('/api/leagues', { name }, createToken, 'create');
        }}
      >
        <h2 className="font-semibold">{t('createCta')}</h2>
        <label htmlFor="league-name" className="sr-only">
          {t('namePlaceholder')}
        </label>
        <input
          id="league-name"
          name="leagueName"
          autoComplete="off"
          required
          minLength={3}
          maxLength={40}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('namePlaceholder')}
          className="mt-4 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 outline-none focus:border-emerald-400"
        />
        <TurnstileWidget onToken={setCreateToken} />
        <button
          disabled={busy !== null}
          className="mt-3 w-full rounded-xl bg-emerald-400 px-4 py-2.5 font-bold text-emerald-950 disabled:opacity-50"
        >
          {busy === 'create' ? t('working') : t('createCta')}
        </button>
      </form>

      <form
        className="rounded-2xl border border-neutral-800 bg-neutral-900/45 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit('/api/leagues/join', { code }, joinToken, 'join');
        }}
      >
        <h2 className="font-semibold">{t('joinCta')}</h2>
        <label htmlFor="league-code" className="sr-only">
          {t('codePlaceholder')}
        </label>
        <input
          id="league-code"
          name="leagueCode"
          autoComplete="off"
          inputMode="text"
          required
          minLength={8}
          maxLength={8}
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder={t('codePlaceholder')}
          className="mt-4 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 font-mono tracking-[0.25em] uppercase outline-none focus:border-cyan-400"
        />
        <TurnstileWidget onToken={setJoinToken} />
        <button
          disabled={busy !== null}
          className="mt-3 w-full rounded-xl border border-cyan-700 bg-cyan-400/10 px-4 py-2.5 font-bold text-cyan-200 disabled:opacity-50"
        >
          {busy === 'join' ? t('working') : t('joinCta')}
        </button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-rose-300 md:col-span-2">
          {error}
        </p>
      )}
    </div>
  );
}
