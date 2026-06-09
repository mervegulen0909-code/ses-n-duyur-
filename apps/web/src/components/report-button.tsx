'use client';

import { useState } from 'react';

export function ReportButton({
  targetType,
  targetId,
}: {
  targetType: 'performance' | 'comment' | 'profile';
  targetId: string;
}) {
  const [done, setDone] = useState(false);

  async function report() {
    const reason = window.prompt('Why are you reporting this?');
    if (!reason || reason.trim().length < 3) return;
    const res = await fetch('/api/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetType, targetId, reason: reason.trim() }),
    });
    if (res.ok) setDone(true);
  }

  if (done) return <span className="text-xs text-neutral-500">Reported — thank you.</span>;

  return (
    <button type="button" onClick={report} className="text-xs text-neutral-500 hover:text-rose-400">
      Report
    </button>
  );
}
