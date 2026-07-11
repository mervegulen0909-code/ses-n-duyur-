import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { initLocale } from '@/lib/i18n';
import { configureNotificationHandler } from '@/lib/push';
import { usePushRegistration } from '@/lib/use-push-registration';

// Surface foreground notifications app-wide. Safe in Expo Go; runs once.
configureNotificationHandler();

// Root navigator: a dark Stack. Screens render their own headers (via
// SafeAreaView), so the native header is hidden. Tabs return in a later phase.
export default function RootLayout() {
  // Register for remote push once a user signs in (no-op/typed reason in Expo Go).
  usePushRegistration();

  // Apply a persisted language override (if any) once AsyncStorage resolves —
  // i18next already booted with the device locale synchronously (see
  // lib/i18n), this just layers the user's explicit choice on top.
  useEffect(() => {
    void initLocale();
  }, []);

  return (
    <ThemeProvider value={DarkTheme}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#070d18' },
        }}
      />
    </ThemeProvider>
  );
}
