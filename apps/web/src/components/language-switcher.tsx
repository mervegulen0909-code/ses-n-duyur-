'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { LOCALE_NAMES, LOCALES } from '@/i18n/config';

/**
 * Cookie-based language picker (no i18n routing). Writes `NEXT_LOCALE` — read by
 * src/i18n/request.ts on the next render — then refreshes so Server Components
 * re-render in the new locale. The URL never changes.
 */
export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const nextLocale = e.target.value;
    document.cookie = `NEXT_LOCALE=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
    void fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locale: nextLocale }),
    });
    startTransition(() => router.refresh());
  }

  return (
    <select
      value={locale}
      onChange={onChange}
      disabled={pending}
      aria-label="Language"
      className="rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-300 outline-none hover:border-neutral-500 disabled:opacity-50"
    >
      {LOCALES.map((l) => (
        <option key={l} value={l}>
          {LOCALE_NAMES[l]}
        </option>
      ))}
    </select>
  );
}
