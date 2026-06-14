import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@voxscore/db';
import { LargeSecureStore } from './secure-store';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Fail loudly in dev so a missing .env doesn't look like a silent network error.
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy apps/mobile/.env.example to .env.',
  );
}

/**
 * Supabase client for React Native. Sessions persist ENCRYPTED via
 * LargeSecureStore (AES key in the OS keychain, ciphertext in AsyncStorage); RLS
 * (the same policies as web) protects every table. The anon key is client-safe.
 */
export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    storage: new LargeSecureStore(),
    autoRefreshToken: true,
    persistSession: true,
    // React Native has no URL-based auth redirect to parse.
    detectSessionInUrl: false,
  },
});
