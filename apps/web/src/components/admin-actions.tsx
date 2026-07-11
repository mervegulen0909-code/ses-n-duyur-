'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

async function post(url: string, body: unknown): Promise<boolean> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.ok;
}

const btn = 'rounded-md border border-neutral-700 px-2.5 py-1 text-xs hover:border-neutral-500';

export function ModerationActions({
  flagId,
  performanceId,
}: {
  flagId: string;
  performanceId?: string;
}) {
  const router = useRouter();
  const t = useTranslations('Admin');
  const [busy, setBusy] = useState(false);

  async function act(status: 'resolved' | 'dismissed', hide = false) {
    setBusy(true);
    await post('/api/admin/moderate', {
      flagId,
      status,
      hidePerformanceId: hide ? performanceId : undefined,
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      <button disabled={busy} className={btn} onClick={() => act('dismissed')}>
        {t('dismiss')}
      </button>
      <button disabled={busy} className={btn} onClick={() => act('resolved')}>
        {t('resolve')}
      </button>
      {performanceId && (
        <button
          disabled={busy}
          className={`${btn} border-rose-700 text-rose-300`}
          onClick={() => act('resolved', true)}
        >
          {t('resolveHide')}
        </button>
      )}
    </div>
  );
}

export function PerformanceRequestActions({ requestId }: { requestId: string }) {
  const router = useRouter();
  const t = useTranslations('Admin');
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  async function act(action: 'approve' | 'reject') {
    setBusy(true);
    setError('');
    const res = await fetch('/api/admin/performance-requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        requestId,
        action,
        rejectionReason: action === 'reject' ? reason : undefined,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? t('rejectionReasonPlaceholder'));
      return;
    }
    router.refresh();
  }

  if (rejecting) {
    return (
      <div className="flex flex-col gap-2">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('rejectionReasonPlaceholder')}
          className="rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs outline-none focus:border-rose-500"
        />
        <div className="flex gap-2">
          <button
            disabled={busy || reason.trim().length < 3}
            className={`${btn} border-rose-700 text-rose-300`}
            onClick={() => act('reject')}
          >
            {t('reject')}
          </button>
          <button disabled={busy} className={btn} onClick={() => setRejecting(false)}>
            {t('dismiss')}
          </button>
        </div>
        {error && <p className="text-xs text-rose-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button disabled={busy} className={btn} onClick={() => setRejecting(true)}>
          {t('reject')}
        </button>
        <button
          disabled={busy}
          className={`${btn} border-emerald-700 text-emerald-300`}
          onClick={() => act('approve')}
        >
          {t('approve')}
        </button>
      </div>
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  );
}

export function AppealActions({ appealId }: { appealId: string }) {
  const router = useRouter();
  const t = useTranslations('Admin');
  const [busy, setBusy] = useState(false);
  const [denying, setDenying] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  async function act(action: 'uphold' | 'deny') {
    setBusy(true);
    setError('');
    const res = await fetch('/api/admin/appeals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        appealId,
        action,
        resolutionNote: action === 'deny' ? reason : undefined,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? t('rejectionReasonPlaceholder'));
      return;
    }
    router.refresh();
  }

  if (denying) {
    return (
      <div className="flex flex-col gap-2">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('rejectionReasonPlaceholder')}
          className="rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs outline-none focus:border-rose-500"
        />
        <div className="flex gap-2">
          <button
            disabled={busy || reason.trim().length < 3}
            className={`${btn} border-rose-700 text-rose-300`}
            onClick={() => act('deny')}
          >
            {t('reject')}
          </button>
          <button disabled={busy} className={btn} onClick={() => setDenying(false)}>
            {t('dismiss')}
          </button>
        </div>
        {error && <p className="text-xs text-rose-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button disabled={busy} className={btn} onClick={() => setDenying(true)}>
          {t('reject')}
        </button>
        <button
          disabled={busy}
          className={`${btn} border-emerald-700 text-emerald-300`}
          onClick={() => act('uphold')}
        >
          {t('approve')}
        </button>
      </div>
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  );
}

export function DmcaActions({
  requestId,
  performanceId,
}: {
  requestId: string;
  performanceId?: string | null;
}) {
  const router = useRouter();
  const t = useTranslations('Admin');
  const [busy, setBusy] = useState(false);

  async function act(status: 'actioned' | 'rejected') {
    setBusy(true);
    await post('/api/admin/dmca', {
      requestId,
      status,
      performanceId: status === 'actioned' ? (performanceId ?? undefined) : undefined,
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      <button disabled={busy} className={btn} onClick={() => act('rejected')}>
        {t('reject')}
      </button>
      <button
        disabled={busy}
        className={`${btn} border-rose-700 text-rose-300`}
        onClick={() => act('actioned')}
      >
        {t('takeDown')}
      </button>
    </div>
  );
}
