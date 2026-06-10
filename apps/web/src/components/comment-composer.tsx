'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Posts a comment to /api/comments, then refreshes the Server Component so the
 * new comment appears. The author is the session/JWT user server-side — this
 * sends only the body + performance id. Mirrors AddPerformanceForm's flow.
 */
export function CommentComposer({ performanceId }: { performanceId: string }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (trimmed.length < 1) return;
    setStatus('submitting');
    setMessage('');
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ performanceId, body: trimmed }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus('error');
        setMessage(b.error ?? `Failed (${res.status})`);
        return;
      }
      setBody('');
      setStatus('idle');
      router.refresh();
    } catch {
      setStatus('error');
      setMessage('Network error');
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={4000}
        rows={3}
        placeholder="Add a comment…"
        className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-emerald-500"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={status === 'submitting' || body.trim().length === 0}
          className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {status === 'submitting' ? 'Posting…' : 'Comment'}
        </button>
        {status === 'error' && <span className="text-sm text-rose-400">{message}</span>}
      </div>
    </form>
  );
}
