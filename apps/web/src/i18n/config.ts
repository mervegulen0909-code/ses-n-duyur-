/** Supported UI locales. Add a new code here + a messages/<code>.json file. */
export const LOCALES = ['en', 'tr', 'zh', 'hi', 'es', 'fr', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/** Native display names for the language switcher. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  tr: 'Türkçe',
  zh: '中文',
  hi: 'हिन्दी',
  es: 'Español',
  fr: 'Français',
  ar: 'العربية',
};

/** Text direction per locale — drives the <html dir> attribute for RTL scripts. */
export const LOCALE_DIR: Record<Locale, 'ltr' | 'rtl'> = {
  en: 'ltr',
  tr: 'ltr',
  zh: 'ltr',
  hi: 'ltr',
  es: 'ltr',
  fr: 'ltr',
  ar: 'rtl',
};

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}
