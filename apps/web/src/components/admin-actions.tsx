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
