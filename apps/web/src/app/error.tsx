'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('Errors');

  useEffect(() => {
    console.error('[ui-error-boundary]', { digest: error.digest, name: error.name });
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[55vh] max-w-3xl items-center px-6 py-14">
      <div className="w-full border-y border-neutral-800 py-10">
        <p className="text-xs font-black tracking-[0.2em] text-rose-300 uppercase">
          {t('eyebrow')}
        </p>
        <h1 className="mt-3 text-4xl font-black tracking-tight">{t('title')}</h1>
        <p className="mt-4 max-w-xl text-neutral-400">{t('body')}</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-xl bg-emerald-400 px-5 py-3 font-bold text-emerald-950"
          >
            {t('retry')}
          </button>
          <Link href="/" className="rounded-xl border border-neutral-700 px-5 py-3 font-bold">
            {t('home')}
          </Link>
        </div>
      </div>
    </main>
  );
}
