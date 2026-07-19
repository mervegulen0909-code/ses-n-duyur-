'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type Step = 'idle' | 'confirm' | 'deleting' | 'error';

/**
 * Web counterpart of the mobile Profile screen's "Delete account" flow — same
 * two-deliberate-taps pattern (Apple 5.1.1(v) / Google Play in-app + web
 * deletion requirement), same server call. Deletes server-side, signs the
 * browser session out, then leaves.
 */
export function AccountDeleteConfirm({ email }: { email: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState('');

  async function runDelete() {
    setStep('deleting');
    setError('');
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || body.ok === false) {
        setError(body.error ?? 'Could not delete account. Please try again.');
        setStep('error');
        return;
      }
      await createSupabaseBrowserClient().auth.signOut();
      router.replace('/');
      router.refresh();
    } catch {
      setError('Could not delete account. Please try again.');
      setStep('error');
    }
  }

  if (step === 'idle' || step === 'error') {
    return (
      <div className="space-y-3">
        {email && <p className="text-neutral-400">Signed in as {email}.</p>}
        {error && <p className="text-rose-400">{error}</p>}
        <button
          type="button"
          onClick={() => setStep('confirm')}
          className="rounded-lg border border-rose-700/60 bg-rose-950/30 px-4 py-2 text-sm font-medium text-rose-300 hover:border-rose-500"
        >
          Delete my account
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-rose-700/60 bg-rose-950/20 p-4">
      <p className="font-semibold text-rose-200">
        This permanently deletes your account, profile, performances, votes, listens, and comments.
        This cannot be undone.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => void runDelete()}
          disabled={step === 'deleting'}
          className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {step === 'deleting' ? 'Deleting…' : 'Yes, delete forever'}
        </button>
        <button
          type="button"
          onClick={() => setStep('idle')}
          disabled={step === 'deleting'}
          className="text-sm text-neutral-400 hover:text-neutral-200"
        >
          Keep my account
        </button>
      </div>
    </div>
  );
}
