/** Supported UI locales. Add a new code here + a locales/<code>.json file. */
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

/** RTL scripts — drives I18nManager.forceRTL(). Only Arabic today. */
export const RTL_LOCALES: readonly Locale[] = ['ar'];

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}
