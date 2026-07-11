'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * "Appeal this" form for a moderation action visible to its target — e.g. the
 * hidden-performance banner on the owner's own performance page. Submits to
 * /api/appeals as the signed-in user; the admin queue (/admin/appeals)
 * decides and performs the actual reversal.
 */
export function AppealForm({
  targetType,
  targetId,
}: {
  targetType: 'performance' | 'comment' | 'performance_request';
  targetId: string;
}) {
  const t = useTranslations('Appeals');
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  async function submit() {
    const trimmed = reason.trim();
    if (trimmed.length < 10) return;
    setStatus('submitting');
    setError('');
    try {
      const res = await fetch('/api/appeals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetType, targetId, reason: trimmed }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus('error');
        setError(b.error ?? t('genericError'));
        return;
      }
      setStatus('done');
    } catch {
      setStatus('error');
      setError(t('genericError'));
    }
  }

  if (status === 'done') {
    return <p className="text-sm text-emerald-400">{t('submitted')}</p>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-emerald-400 hover:underline"
      >
        {t('appealThis')}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={2000}
        rows={3}
        placeholder={t('reasonPlaceholder')}
        className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-emerald-500"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={status === 'submitting' || reason.trim().length < 10}
          className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {status === 'submitting' ? t('submitting') : t('submit')}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-neutral-500 hover:text-neutral-300"
        >
          {t('cancel')}
        </button>
        {status === 'error' && <span className="text-sm text-rose-400">{error}</span>}
      </div>
    </div>
  );
}
