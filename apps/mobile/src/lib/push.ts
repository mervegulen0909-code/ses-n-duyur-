import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Push notifications for VoxScore (native).
 *
 * GATING — read before shipping:
 *   • REMOTE (Expo push) notifications require a DEVELOPMENT BUILD. Since Expo
 *     SDK 53 remote push is NOT supported in Expo Go (Android throws / iOS no-op).
 *     `getExpoPushTokenAsync` will fail in Expo Go — `registerForPushNotifications`
 *     detects Expo Go and returns a typed reason instead of throwing.
 *   • LOCAL notifications (`scheduleLocalNotification`) DO work in Expo Go, so
 *     they are safe to use everywhere for in-app reminders.
 *   • A simulator/emulator cannot receive a real push token — `Device.isDevice`
 *     guards that.
 *
 * BACKEND (design only — not built here): the Expo push token returned by
 * `registerForPushNotifications` must be POSTed to the server and stored in a
 * `push_tokens` table keyed by user. The server then sends pushes via Expo's
 * Push API. Endpoint + table sketch is documented at the bottom of this file.
 */

export type PushTokenResult =
  | { ok: true; token: string }
  | { ok: false; reason: PushUnavailableReason };

export type PushUnavailableReason =
  | 'expo-go' // remote push needs a dev build (SDK 53+)
  | 'not-a-device' // simulator/emulator can't get a real token
  | 'permission-denied' // user declined the OS prompt
  | 'no-project-id' // EAS projectId missing from app config
  | 'error'; // anything else (network / native failure)

const ANDROID_DEFAULT_CHANNEL = 'default';

/**
 * True when the JS is running inside the Expo Go sandbox. SDK 56 reports this
 * via `Constants.executionEnvironment === ExecutionEnvironment.StoreClient`
 * (the older `appOwnership` field is deprecated). Remote push is unavailable
 * here.
 */
export function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

/** Resolve the EAS projectId required by `getExpoPushTokenAsync`. */
function getProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    // `easConfig` is present in dev/preview builds created by EAS.
    Constants.easConfig?.projectId
  );
}

/**
 * Foreground presentation behavior. Call ONCE at app startup (e.g. in the root
 * layout) so notifications surface while the app is open. Safe in Expo Go.
 */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Create the Android notification channel. Required for notifications to show on
 * Android 8+, and the channel should exist BEFORE requesting permission on
 * Android 13+. No-op on iOS. Safe in Expo Go.
 */
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_DEFAULT_CHANNEL, {
    name: 'Default',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: '#22D3EE',
  });
}

/**
 * Ask for notification permission, returning whether it was granted. Mirrors
 * the documented pattern: check existing status first, only prompt if needed.
 * Works in Expo Go (the OS prompt for LOCAL notifications still appears).
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * Full REMOTE-push registration: ensure the Android channel, request permission,
 * then fetch the Expo push token. Returns a typed result rather than throwing,
 * so callers can branch on the reason (notably 'expo-go' → needs a dev build).
 *
 * The caller is responsible for sending `result.token` to the backend
 * (`push_tokens` table — see note below). This util does NOT make that call,
 * because the POST /api/push/register endpoint is not built yet (see the
 * backend-contract sketch at the bottom of this file).
 */
export async function registerForPushNotifications(): Promise<PushTokenResult> {
  // Remote push is unavailable in Expo Go since SDK 53 — needs a dev build.
  if (isExpoGo()) return { ok: false, reason: 'expo-go' };

  // A simulator/emulator can't be issued a real APNs/FCM token.
  if (!Device.isDevice) return { ok: false, reason: 'not-a-device' };

  await ensureAndroidChannel();

  const granted = await requestNotificationPermission();
  if (!granted) return { ok: false, reason: 'permission-denied' };

  const projectId = getProjectId();
  if (!projectId) return { ok: false, reason: 'no-project-id' };

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return { ok: true, token: data };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/**
 * Schedule a LOCAL notification. Works in Expo Go and standalone alike — use it
 * for in-app reminders (e.g. "your Verified Listen unlocked voting") that don't
 * need the server. Pass `seconds` to defer, omit for an immediate fire.
 */
export async function scheduleLocalNotification(
  title: string,
  body: string,
  seconds?: number,
): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger:
      seconds && seconds > 0
        ? { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds }
        : null,
  });
}

/* ---------------------------------------------------------------------------
 * BACKEND CONTRACT (design only — NOT implemented here)
 * ---------------------------------------------------------------------------
 * 1. Migration — store one token row per (user, device). RLS so a user only
 *    sees/writes their own rows; the server (service_role) reads all to send.
 *
 *    create table public.push_tokens (
 *      id          uuid primary key default gen_random_uuid(),
 *      user_id     uuid not null references public.profiles (id) on delete cascade,
 *      token       text not null,                 -- Expo push token (ExponentPushToken[..])
 *      platform    text not null check (platform in ('ios','android')),
 *      created_at  timestamptz not null default now(),
 *      updated_at  timestamptz not null default now(),
 *      unique (user_id, token)
 *    );
 *    alter table public.push_tokens enable row level security;
 *    create policy push_tokens_select_own on public.push_tokens
 *      for select using (user_id = auth.uid());
 *    create policy push_tokens_upsert_own on public.push_tokens
 *      for insert with check (user_id = auth.uid());
 *    create policy push_tokens_update_own on public.push_tokens
 *      for update using (user_id = auth.uid()) with check (user_id = auth.uid());
 *
 * 2. Register endpoint — POST /api/push/register { token, platform }
 *    (Bearer-auth, same pattern as api.ts; pending backend Bearer support).
 *    Upserts on (user_id, token), bumping updated_at. The client adapter would
 *    live alongside startListen/submitVote in apps/mobile/src/lib/api.ts, e.g.
 *      export async function registerPushToken(token, platform) {
 *        return authedPost('/api/push/register', { token, platform });
 *      }
 *
 * 3. Send pushes — server-side only, via Expo's Push API
 *    (POST https://exp.host/--/api/v2/push/send) using the stored tokens.
 *    Triggers: battle opened for a performance you own, your performance got a
 *    new vote / changed rank, comment reply, etc. Prune tokens that Expo reports
 *    as DeviceNotRegistered in the receipts.
 * ------------------------------------------------------------------------- */
