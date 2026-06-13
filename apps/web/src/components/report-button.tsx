'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

export function ReportButton({
  targetType,
  targetId,
}: {
  targetType: 'performance' | 'comment' | 'profile';
  targetId: string;
}) {
  const t = useTranslations('Report');
  const [done, setDone] = useState(false);

  async function report() {
    const reason = window.prompt(t('promptReason'));
    if (!reason || reason.trim().length < 3) return;
    const res = await fetch('/api/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetType, targetId, reason: reason.trim() }),
    });
    if (res.ok) setDone(true);
  }

  if (done) return <span className="text-xs text-neutral-500">{t('thanks')}</span>;

  return (
    <button type="button" onClick={report} className="text-xs text-neutral-500 hover:text-rose-400">
      {t('button')}
    </button>
  );
}
