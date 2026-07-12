import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager } from 'react-native';

import { DEFAULT_LOCALE, isLocale, LOCALES, RTL_LOCALES, type Locale } from './config';

import ar from './locales/ar.json';
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import hi from './locales/hi.json';
import tr from './locales/tr.json';
import zh from './locales/zh.json';

const resources = {
  en: { translation: en },
  tr: { translation: tr },
  zh: { translation: zh },
  hi: { translation: hi },
  es: { translation: es },
  fr: { translation: fr },
  ar: { translation: ar },
};

const STORAGE_KEY = 'voxscore.locale';

/** Device locale from the OS, mapped to a supported code, else the default. */
function deviceLocale(): Locale {
  for (const l of Localization.getLocales()) {
    if (isLocale(l.languageCode)) return l.languageCode;
  }
  return DEFAULT_LOCALE;
}

function isRtl(locale: Locale): boolean {
  return (RTL_LOCALES as readonly string[]).includes(locale);
}

/**
 * Resolve the starting locale (stored override > device locale > default) and
 * initialize i18next synchronously with it. AsyncStorage is async, so the
 * FIRST render always uses the device/default locale; once the stored
 * override loads we re-set the language (see `initLocale` below), same
 * pattern as the web cookie flow — a one-frame flash is an acceptable
 * trade-off vs. blocking app boot on storage I/O.
 */
const initialLocale = deviceLocale();
I18nManager.allowRTL(true);

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLocale,
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: LOCALES as unknown as string[],
  interpolation: { escapeValue: false },
  compatibilityJSON: 'v4',
});

/**
 * Loads a persisted locale override (set via `setLocale`) once AsyncStorage
 * resolves. Call once from the root layout.
 */
export async function initLocale(): Promise<void> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (isLocale(stored) && stored !== i18n.language) {
    await i18n.changeLanguage(stored);
  }
  I18nManager.forceRTL(isRtl(i18n.language as Locale));
}

/**
 * Switch language and persist the choice. Returns `true` when the text
 * direction changed (LTR↔RTL) — React Native only fully applies a direction
 * flip after the app reloads, so callers should prompt the user to restart.
 */
export async function setLocale(locale: Locale): Promise<boolean> {
  const wasRtl = I18nManager.isRTL;
  await AsyncStorage.setItem(STORAGE_KEY, locale);
  await i18n.changeLanguage(locale);
  const nowRtl = isRtl(locale);
  I18nManager.forceRTL(nowRtl);
  return wasRtl !== nowRtl;
}

export { LOCALES, LOCALE_NAMES, DEFAULT_LOCALE, isLocale } from './config';
export type { Locale } from './config';
export default i18n;
