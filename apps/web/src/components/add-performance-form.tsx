'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { SONG_CATEGORIES, type SongCategory } from '@voxscore/core';
import { TurnstileWidget } from './turnstile-widget';

const CATEGORY_KEY: Record<SongCategory, string> = {
  pop: 'pop',
  rock: 'rock',
  'rnb-soul': 'rnbSoul',
  ballad: 'ballad',
  'turkish-global': 'turkishGlobal',
  'indie-alternative': 'indieAlternative',
  'musical-classical': 'musicalClassical',
  other: 'other',
};

export function AddPerformanceForm() {
  const router = useRouter();
  const t = useTranslations();
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState<SongCategory>('pop');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error' | 'success'>('idle');
  const [message, setMessage] = useState('');
  const [requestId, setRequestId] = useState('');
  const [token, setToken] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('submitting');
    setMessage('');
    try {
      const res = await fetch('/api/performance-requests', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { 'x-turnstile-token': token } : {}),
        },
        body: JSON.stringify({ youtubeUrl: url, category, note: note.trim() || undefined }),
      });
      const body = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !body.id) {
        setStatus('error');
        setMessage(body.error ?? t('Common.failedStatus', { status: res.status }));
        return;
      }
      setRequestId(body.id);
      setStatus('success');
      setUrl('');
      setNote('');
      router.refresh();
    } catch {
      setStatus('error');
      setMessage(t('Common.networkError'));
    }
  }

  if (status === 'success') {
    return (
      <div className="w-full max-w-xl rounded-lg border border-emerald-700/50 bg-emerald-500/10 p-4 text-center">
        <p className="font-medium text-emerald-300">{t('Add.requestSuccessTitle')}</p>
        <p className="mt-1 text-sm text-neutral-400">
          {t('Add.requestSuccessBody', { id: requestId })}
        </p>
        <button
          type="button"
          onClick={() => setStatus('idle')}
          className="mt-3 text-sm font-medium text-emerald-400 hover:underline"
        >
          {t('Add.requestSubmit')}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-xl flex-col gap-3">
      <label htmlFor="yt" className="text-sm text-neutral-400">
        {t('Add.urlLabel')}
      </label>
      <input
        id="yt"
        type="url"
        required
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://www.youtube.com/watch?v=..."
        className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100 outline-none focus:border-emerald-500"
      />

      <label htmlFor="category" className="text-sm text-neutral-400">
        {t('Add.categoryLabel')}
      </label>
      <select
        id="category"
        value={category}
        onChange={(e) => setCategory(e.target.value as SongCategory)}
        className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100 outline-none focus:border-emerald-500"
      >
        {SONG_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {t(`Category.${CATEGORY_KEY[c]}`)}
          </option>
        ))}
      </select>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t('Add.notePlaceholder')}
        rows={2}
        maxLength={1000}
        className="resize-none rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-emerald-500"
      />

      <TurnstileWidget onToken={setToken} />

      <button
        type="submit"
        disabled={status === 'submitting'}
        className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {status === 'submitting' ? t('Add.requestSubmitting') : t('Add.requestSubmit')}
      </button>
      {status === 'error' && <p className="text-sm text-rose-400">{message}</p>}
      <p className="text-xs text-neutral-600">{t('Add.reviewNote')}</p>
    </form>
  );
}
