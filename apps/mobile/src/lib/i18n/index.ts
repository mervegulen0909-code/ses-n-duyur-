import AsyncStorage from '@react-native-async-storage/async-storage';
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

function isRtl(locale: Locale): boolean {
  return (RTL_LOCALES as readonly string[]).includes(locale);
}

/**
 * Start in English, whatever the device language is, and initialize i18next
 * synchronously with it.
 *
 * The OS locale is deliberately NOT consulted. The store listing ships in
 * English only, so following the device language made the app disagree with
 * the page the user just came from — a Turkish phone opened a Turkish app off
 * an English listing, and a reviewer on a non-English device would have judged
 * a translation we do not advertise. The other languages stay available; they
 * are now an explicit choice in the language switcher rather than a guess.
 *
 * A stored override still wins: AsyncStorage is async, so the FIRST render
 * uses English and `initLocale` re-sets the language once the override loads.
 * A one-frame flash beats blocking app boot on storage I/O.
 */
const initialLocale: Locale = DEFAULT_LOCALE;
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
