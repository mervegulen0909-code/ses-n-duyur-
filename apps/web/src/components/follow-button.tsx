'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

/**
 * Follow/unfollow toggle for a creator's public profile. Rendered only for a
 * signed-in viewer looking at someone ELSE's profile (the server page decides
 * that). The server resolves handle → id and RLS pins the edge to the caller,
 * so this sends the handle only. Refreshes the Server Component afterwards so
 * the follower count updates.
 */
export function FollowButton({
  handle,
  initialFollowing,
}: {
  handle: string;
  initialFollowing: boolean;
}) {
  const router = useRouter();
  const t = useTranslations('Profile');
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setError('');
    const next = !following;
    try {
      const res = await fetch('/api/follows', {
        method: next ? 'POST' : 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ followeeHandle: handle }),
      });
      // 409 on POST means the edge already exists (double-tap/race) — treat it
      // as success so the button state converges on the truth.
      if (!res.ok && !(next && res.status === 409)) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setError(b.error ?? t('followFailed'));
        return;
      }
      setFollowing(next);
      router.refresh();
    } catch {
      setError(t('followFailed'));
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
        className={
          following
            ? 'rounded-full border border-neutral-600 px-4 py-1 text-sm font-medium text-neutral-300 hover:border-rose-500/60 hover:text-rose-300 disabled:opacity-50'
            : 'rounded-full bg-emerald-600 px-4 py-1 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50'
        }
      >
        {following ? t('unfollow') : t('follow')}
      </button>
      {error && <span className="text-xs text-rose-400">{error}</span>}
    </span>
  );
}
