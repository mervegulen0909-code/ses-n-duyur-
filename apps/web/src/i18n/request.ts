import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE, isLocale, LOCALES, type Locale } from './config';

/**
 * Resolve the active locale WITHOUT i18n routing: the `NEXT_LOCALE` cookie wins
 * (set by the language switcher), else the first matching Accept-Language, else
 * the default. Keeps every URL locale-free, so no route moves / middleware merge.
 */
function resolveLocale(cookieValue: string | undefined, acceptLanguage: string | null): Locale {
  if (isLocale(cookieValue)) return cookieValue;
  for (const part of (acceptLanguage ?? '').split(',')) {
    const code = part.trim().split(/[-;]/)[0]?.toLowerCase();
    if (isLocale(code)) return code;
  }
  return DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const locale = resolveLocale(
    cookieStore.get('NEXT_LOCALE')?.value,
    headerStore.get('accept-language'),
  );

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});

export { LOCALES };
