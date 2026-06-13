import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { registerPushToken } from './api';
import {
  registerForPushNotifications,
  type PushTokenResult,
  type PushUnavailableReason,
} from './push';
import { useSession } from './use-session';

export type PushRegistrationStatus = 'idle' | 'registering' | 'registered' | 'unavailable';

/**
 * Registers for remote push once a user is signed in, and exposes the resulting
 * Expo push token + a typed status. Mirrors the verified-listen hook style.
 *
 * NOTE: this only fetches the token. Sending it to the backend is gated on the
 * `/api/push/register` endpoint, which is not built yet (see push.ts). When
 * that lands, call the api.ts adapter inside the `ok` branch.
 *
 * In Expo Go this resolves to status 'unavailable' with reason 'expo-go':
 * remote push needs a development build since SDK 53. Local notifications
 * (scheduleLocalNotification) still work without any of this.
 */
export function usePushRegistration() {
  const { user } = useSession();
  const [status, setStatus] = useState<PushRegistrationStatus>('idle');
  const [token, setToken] = useState<string | null>(null);
  const [reason, setReason] = useState<PushUnavailableReason | null>(null);

  const register = useCallback(async () => {
    setStatus('registering');
    setReason(null);
    const res: PushTokenResult = await registerForPushNotifications();
    if (res.ok) {
      setToken(res.token);
      setStatus('registered');
      // Persist to the backend so the server can target this device. Best-effort:
      // a failure here does NOT downgrade local status — the token is still valid,
      // we just couldn't store it yet (e.g. the API host hasn't shipped this build).
      try {
        await registerPushToken(res.token, Platform.OS === 'android' ? 'android' : 'ios');
      } catch {
        // network/unreachable — the next sign-in re-runs registration.
      }
    } else {
      setToken(null);
      setReason(res.reason);
      setStatus('unavailable');
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setStatus('idle');
      setToken(null);
      setReason(null);
      return;
    }
    void register();
  }, [user, register]);

  return { status, token, reason, register };
}
