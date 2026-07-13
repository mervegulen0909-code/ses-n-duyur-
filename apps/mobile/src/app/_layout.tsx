import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  InstrumentSans_700Bold,
  useFonts,
} from '@expo-google-fonts/instrument-sans';
import { DMMono_400Regular, DMMono_500Medium } from '@expo-google-fonts/dm-mono';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { COLORS } from '@/constants/brand';
import { initLocale } from '@/lib/i18n';
import { configureNotificationHandler } from '@/lib/push';
import { usePushRegistration } from '@/lib/use-push-registration';

// Surface foreground notifications app-wide. Safe in Expo Go; runs once.
configureNotificationHandler();

// Hold the native splash until the brand fonts (Instrument Sans + DM Mono) are
// ready, so the first frame never flashes a system-font fallback. No-op on web.
void SplashScreen.preventAutoHideAsync();

// Root navigator: a dark Stack. Screens render their own headers (via
// SafeAreaView), so the native header is hidden. Tabs return in a later phase.
export default function RootLayout() {
  // Register for remote push once a user signs in (no-op/typed reason in Expo Go).
  usePushRegistration();

  const [fontsLoaded, fontError] = useFonts({
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    InstrumentSans_700Bold,
    DMMono_400Regular,
    DMMono_500Medium,
  });

  // Reveal the app once fonts resolve. On a font *error* we still hide the
  // splash and render (RN falls back to the system face) — never brick boot.
  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  // Apply a persisted language override (if any) once AsyncStorage resolves —
  // i18next already booted with the device locale synchronously (see
  // lib/i18n), this just layers the user's explicit choice on top.
  useEffect(() => {
    void initLocale();
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ThemeProvider value={DarkTheme}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: COLORS.surface },
        }}
      />
    </ThemeProvider>
  );
}
