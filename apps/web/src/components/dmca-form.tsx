'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

export function DmcaForm() {
  const t = useTranslations('Dmca');
  const [claimant, setClaimant] = useState('');
  const [performanceId, setPerformanceId] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    const res = await fetch('/api/dmca', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        claimant,
        performanceId: performanceId.trim() || undefined,
        details: details.trim() || undefined,
      }),
    });
    setBusy(false);
    if (res.ok) {
      setMsg(t('filed'));
      setClaimant('');
      setPerformanceId('');
      setDetails('');
    } else {
      setMsg(t('failed'));
    }
  }

  const input =
    'w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-emerald-500';

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        required
        value={claimant}
        onChange={(e) => setClaimant(e.target.value)}
        placeholder={t('claimantPlaceholder')}
        className={input}
      />
      <input
        value={performanceId}
        onChange={(e) => setPerformanceId(e.target.value)}
        placeholder={t('performanceIdPlaceholder')}
        className={input}
      />
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        placeholder={t('detailsPlaceholder')}
        rows={5}
        className={input}
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? t('filing') : t('submit')}
      </button>
      {msg && <p className="text-sm text-neutral-400">{msg}</p>}
    </form>
  );
}
