import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TurnstileChallenge } from '@/components/turnstile-challenge';
import { supabase } from '@/lib/supabase';

// Lets the in-app browser tab finish/dismiss the OAuth redirect cleanly.
WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [turnstileOpen, setTurnstileOpen] = useState(false);

  function done() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      setBusy(false);
      if (error) {
        setError(error.message);
        return;
      }
      done();
      return;
    }

    // Supabase CAPTCHA protection expects a Turnstile token even on native.
    // The widget runs in a WebView on VoxScore's allowed hostname.
    setTurnstileOpen(true);
  }

  async function finishSignup(captchaToken: string | null) {
    setTurnstileOpen(false);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: captchaToken ? { captchaToken } : undefined,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    // If the project has email confirmation DISABLED, signUp returns a session
    // and we're signed in immediately. If it's ENABLED, there is no session yet —
    // tell the user to confirm instead of silently navigating away signed-out.
    if (data.session) {
      done();
      return;
    }
    setNotice(t('Login.signUpNotice'));
    setMode('login');
  }

  async function signInWithGoogle() {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      // Deep-links back into the app (scheme "voxscore"): voxscore://auth-callback
      const redirectTo = Linking.createURL('auth-callback');
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (oauthError) throw oauthError;
      if (!data?.url) throw new Error(t('Login.googleStartError'));

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success' || !result.url) {
        setBusy(false); // user dismissed the browser — not an error
        return;
      }

      // PKCE: Supabase redirects back with ?code=… — trade it for a session.
      const { queryParams } = Linking.parse(result.url);
      const errDesc =
        typeof queryParams?.error_description === 'string' ? queryParams.error_description : null;
      if (errDesc) throw new Error(errDesc);
      const code = typeof queryParams?.code === 'string' ? queryParams.code : null;
      if (!code) throw new Error(t('Login.googleNoCodeError'));

      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) throw exchangeError;
      setBusy(false);
      done();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Login.googleFailError'));
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
        <Text style={styles.backText}>{t('Common.back')}</Text>
      </Pressable>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.center}
      >
        <Text style={styles.heading}>
          {mode === 'login' ? t('Login.signIn') : t('Login.createAccount')}
        </Text>

        <Pressable
          style={({ pressed }) => [styles.googleButton, pressed && styles.buttonPressed]}
          onPress={signInWithGoogle}
          disabled={busy}
        >
          <Text style={styles.googleText}>{t('Login.google')}</Text>
        </Pressable>

        <View style={styles.dividerRow}>
          <View style={styles.divider} />
          <Text style={styles.dividerText}>{t('Login.or')}</Text>
          <View style={styles.divider} />
        </View>

        <TextInput
          style={styles.input}
          placeholder={t('Login.emailPlaceholder')}
          placeholderTextColor="#6b7280"
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder={t('Login.passwordPlaceholder')}
          placeholderTextColor="#6b7280"
          secureTextEntry
          autoCapitalize="none"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          value={password}
          onChangeText={setPassword}
        />

        {!!error && <Text style={styles.error}>{error}</Text>}
        {!!notice && <Text style={styles.notice}>{notice}</Text>}

        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={submit}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#06281d" />
          ) : (
            <Text style={styles.buttonText}>
              {mode === 'login' ? t('Login.signIn') : t('Login.signUp')}
            </Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => {
            setError('');
            setNotice('');
            setMode(mode === 'login' ? 'signup' : 'login');
          }}
          hitSlop={8}
        >
          <Text style={styles.toggle}>
            {mode === 'login' ? t('Login.needAccount') : t('Login.haveAccount')}
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
      <TurnstileChallenge
        visible={turnstileOpen}
        onToken={(token) => void finishSignup(token)}
        onCancel={() => {
          setTurnstileOpen(false);
          setBusy(false);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0a' },
  back: { paddingHorizontal: 16, paddingVertical: 8 },
  backText: { color: '#22D3EE', fontSize: 16, fontWeight: '600' },
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
  heading: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fafafa',
    textAlign: 'center',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#171717',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fafafa',
    fontSize: 16,
  },
  error: { color: '#fb7185', fontSize: 13 },
  notice: { color: '#34D399', fontSize: 13 },
  button: {
    marginTop: 8,
    backgroundColor: '#22D3EE',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: '#06281d', fontSize: 16, fontWeight: '800' },
  toggle: { marginTop: 12, textAlign: 'center', color: '#9ca3af', fontSize: 14 },
  googleButton: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  googleText: { color: '#1f2937', fontSize: 16, fontWeight: '700' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 2 },
  divider: { flex: 1, height: 1, backgroundColor: '#262626' },
  dividerText: { color: '#6b7280', fontSize: 13 },
});
