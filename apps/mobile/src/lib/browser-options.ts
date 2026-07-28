/**
 * Keep Android custom tabs in the VoxScore task so Back reliably returns to
 * the app instead of surfacing an unrelated task from the device history.
 */
export const IN_APP_BROWSER_OPTIONS = {
  createTask: false,
  showTitle: true,
  toolbarColor: '#07101d',
} as const;

type CustomTabsPackages = {
  preferredBrowserPackage?: string;
  browserPackages: string[];
  servicePackages: string[];
};

/**
 * Prefer a browser that actually exposes the Android Custom Tabs service.
 * Some default browsers can open URLs but silently fall back to a full browser
 * task, which makes Back navigate browser history instead of returning home.
 */
export function selectCustomTabsPackage({
  preferredBrowserPackage,
  browserPackages,
  servicePackages,
}: CustomTabsPackages): string | undefined {
  if (preferredBrowserPackage && servicePackages.includes(preferredBrowserPackage)) {
    return preferredBrowserPackage;
  }

  return (
    browserPackages.find((browserPackage) => servicePackages.includes(browserPackage)) ??
    servicePackages[0]
  );
}
