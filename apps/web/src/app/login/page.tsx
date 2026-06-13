'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type Mode = 'login' | 'signup';

export default function LoginPage() {
  const router = useRouter();
  const t = useTranslations('Login');
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');

    const supabase = createSupabaseBrowserClient();
    const { error: authError } =
      mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    setBusy(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-5 px-6 py-16">
      <h1 className="text-center text-2xl font-bold">
        {mode === 'login' ? t('signIn') : t('createAccount')}
      </h1>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('emailPlaceholder')}
          className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 outline-none focus:border-emerald-500"
        />
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t('passwordPlaceholder')}
          className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 outline-none focus:border-emerald-500"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {busy ? t('pleaseWait') : mode === 'login' ? t('signIn') : t('signUp')}
        </button>
        {error && <p className="text-sm text-rose-400">{error}</p>}
      </form>

      <button
        type="button"
        onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
        className="text-sm text-neutral-400 hover:text-neutral-200"
      >
        {mode === 'login' ? t('needAccount') : t('haveAccount')}
      </button>
    </main>
  );
}
