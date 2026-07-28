import { describe, expect, it } from 'vitest';

import { IN_APP_BROWSER_OPTIONS, selectCustomTabsPackage } from './browser-options';

describe('IN_APP_BROWSER_OPTIONS', () => {
  it('keeps Android custom tabs in the app task for reliable Back navigation', () => {
    expect(IN_APP_BROWSER_OPTIONS.createTask).toBe(false);
    expect(IN_APP_BROWSER_OPTIONS.showTitle).toBe(true);
  });

  it('uses the preferred browser when it exposes the Custom Tabs service', () => {
    expect(
      selectCustomTabsPackage({
        preferredBrowserPackage: 'browser.preferred',
        browserPackages: ['browser.preferred', 'browser.other'],
        servicePackages: ['browser.preferred', 'browser.other'],
      }),
    ).toBe('browser.preferred');
  });

  it('skips a default URL browser that does not expose Custom Tabs', () => {
    expect(
      selectCustomTabsPackage({
        preferredBrowserPackage: undefined,
        browserPackages: ['browser.url-only', 'browser.custom-tabs'],
        servicePackages: ['browser.custom-tabs'],
      }),
    ).toBe('browser.custom-tabs');
  });

  it('falls back to an installed Custom Tabs service hidden from browser resolution', () => {
    expect(
      selectCustomTabsPackage({
        preferredBrowserPackage: undefined,
        browserPackages: ['browser.url-only'],
        servicePackages: ['browser.custom-tabs'],
      }),
    ).toBe('browser.custom-tabs');
  });
});
