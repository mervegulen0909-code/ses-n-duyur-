import {
  getCustomTabsSupportingBrowsersAsync,
  openBrowserAsync,
  type WebBrowserOpenOptions,
} from 'expo-web-browser';
import { Platform } from 'react-native';

import { IN_APP_BROWSER_OPTIONS, selectCustomTabsPackage } from './browser-options';

export async function openInAppBrowserAsync(url: string, options: WebBrowserOpenOptions = {}) {
  let browserPackage: string | undefined;

  if (Platform.OS === 'android') {
    try {
      browserPackage = selectCustomTabsPackage(await getCustomTabsSupportingBrowsersAsync());
    } catch {
      // Fall back to Expo's normal browser resolution on unusual Android builds.
    }
  }

  return openBrowserAsync(url, {
    ...IN_APP_BROWSER_OPTIONS,
    ...(browserPackage ? { browserPackage } : {}),
    ...options,
  });
}
