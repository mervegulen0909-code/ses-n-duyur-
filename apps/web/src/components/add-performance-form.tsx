'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TurnstileWidget } from './turnstile-widget';

export function AddPerformanceForm() {
  const router = useRouter();
  const t = useTranslations();
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [token, setToken] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('submitting');
    setMessage('');
    try {
      const res = await fetch('/api/performances', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { 'x-turnstile-token': token } : {}),
        },
        body: JSON.stringify({ youtubeUrl: url }),
      });
      const body = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !body.id) {
        setStatus('error');
        setMessage(body.error ?? t('Common.failedStatus', { status: res.status }));
        return;
      }
      router.push(`/performance/${body.id}`);
    } catch {
      setStatus('error');
      setMessage(t('Common.networkError'));
    }
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
      <TurnstileWidget onToken={setToken} />
      <button
        type="submit"
        disabled={status === 'submitting'}
        className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {status === 'submitting' ? t('Add.adding') : t('Add.submit')}
      </button>
      {status === 'error' && <p className="text-sm text-rose-400">{message}</p>}
    </form>
  );
}
