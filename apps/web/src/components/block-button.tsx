'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

/**
 * Block/unblock a creator — App Store Review Guideline 1.2 requires the ability
 * to block abusive users. Rendered only for a signed-in viewer looking at
 * someone ELSE's profile (the server page decides that). Like FollowButton, it
 * sends the handle only; the server resolves handle → id and RLS pins the row
 * to the caller.
 *
 * Blocking is destructive enough to confirm first: it severs the follow edge in
 * both directions, and a mis-tap would silently drop a relationship the user
 * wanted. Unblocking is harmless, so it goes through without a prompt.
 */
export function BlockButton({
  handle,
  initialBlocked,
}: {
  handle: string;
  initialBlocked: boolean;
}) {
  const router = useRouter();
  const t = useTranslations('Profile');
  const [blocked, setBlocked] = useState(initialBlocked);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function toggle() {
    if (busy) return;
    const next = !blocked;
    if (next && !window.confirm(t('blockConfirm', { handle }))) return;

    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/blocks', {
        method: next ? 'POST' : 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ blockedHandle: handle }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setError(b.error ?? t('blockFailed'));
        return;
      }
      setBlocked(next);
      router.refresh();
    } catch {
      setError(t('blockFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className="text-xs text-neutral-500 hover:text-rose-400 disabled:opacity-50"
      >
        {blocked ? t('unblock') : t('block')}
      </button>
      {error && <span className="text-xs text-rose-400">{error}</span>}
    </span>
  );
}
