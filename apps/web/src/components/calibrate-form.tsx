'use client';

import { useState } from 'react';
import { CRITERIA, type Criterion } from '@vocal-league/scoring';
import { CRITERION_LABELS } from '@/lib/criteria-labels';

export function CalibrateForm() {
  const [performanceId, setPerformanceId] = useState('');
  const [ratings, setRatings] = useState<Record<Criterion, number>>(
    () => Object.fromEntries(CRITERIA.map((c) => [c, 50])) as Record<Criterion, number>,
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    const res = await fetch('/api/admin/calibrate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ performanceId, criteria: ratings }),
    });
    setBusy(false);
    setMsg(res.ok ? 'Calibration saved ✓' : 'Failed to save');
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        required
        value={performanceId}
        onChange={(e) => setPerformanceId(e.target.value)}
        placeholder="Performance ID (UUID)"
        className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-emerald-500"
      />
      {CRITERIA.map((c) => (
        <label key={c} className="block text-sm">
          <span className="flex justify-between text-neutral-400">
            <span>{CRITERION_LABELS[c]}</span>
            <span className="tabular-nums text-neutral-300">{ratings[c]}</span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={ratings[c]}
            onChange={(e) => setRatings((r) => ({ ...r, [c]: Number(e.target.value) }))}
            className="w-full accent-emerald-500"
          />
        </label>
      ))}
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Save calibration'}
      </button>
      {msg && <p className="text-sm text-neutral-400">{msg}</p>}
    </form>
  );
}
