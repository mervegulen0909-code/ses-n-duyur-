'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { track } from '@/lib/analytics';
import { isValidRefCode, REF_COOKIE, REF_COOKIE_MAX_AGE_S } from '@/lib/referral';

type Mode = 'login' | 'signup';

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export default function LoginPage() {
  const router = useRouter();
  const t = useTranslations('Login');
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');

  // Signup bot check: Cloudflare Turnstile, verified server-side by Supabase
  // Auth (enable "Bot and Abuse Protection" in the dashboard with the same
  // key pair). Skipped entirely when the site key isn't configured (local dev).
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    (window as unknown as Record<string, unknown>).onVsTurnstile = (token: string) =>
      setCaptchaToken(token);
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    s.async = true;
    document.head.appendChild(s);
    return () => {
      s.remove();
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');

    if (mode === 'signup') track('signup_started');

    const supabase = createSupabaseBrowserClient();
    const { error: authError } =
      mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            ...(TURNSTILE_SITE_KEY && captchaToken ? { options: { captchaToken } } : {}),
          });

    setBusy(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    if (mode === 'signup') {
      const ref = new URLSearchParams(window.location.search).get('ref');
      track('signup_completed');
      if (ref) track('invite_converted', { ref });
    }
    router.push('/');
    router.refresh();
  }

  async function onGoogle() {
    setBusy(true);
    setError('');
    // The ?ref= param won't survive the Google redirect chain — persist it in
    // a short-lived cookie the auth callback reads for server-side attribution.
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (isValidRefCode(ref)) {
      document.cookie = `${REF_COOKIE}=${ref}; Max-Age=${REF_COOKIE_MAX_AGE_S}; Path=/; SameSite=Lax`;
    }
    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    // On success the browser is redirected to Google, then back to /auth/callback.
    if (authError) {
      setError(authError.message);
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-5 px-6 py-16">
      <h1 className="text-center text-2xl font-bold">
        {mode === 'login' ? t('signIn') : t('createAccount')}
      </h1>

      <button
        type="button"
        onClick={onGoogle}
        disabled={busy}
        className="flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2 font-medium text-neutral-900 transition hover:bg-neutral-100 disabled:opacity-50"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        {t('google')}
      </button>

      <div className="flex items-center gap-3 text-xs text-neutral-500">
        <span className="h-px flex-1 bg-neutral-800" />
        {t('orDivider')}
        <span className="h-px flex-1 bg-neutral-800" />
      </div>

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
        {TURNSTILE_SITE_KEY && mode === 'signup' && (
          <div
            className="cf-turnstile"
            data-sitekey={TURNSTILE_SITE_KEY}
            data-callback="onVsTurnstile"
            data-theme="dark"
          />
        )}
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
