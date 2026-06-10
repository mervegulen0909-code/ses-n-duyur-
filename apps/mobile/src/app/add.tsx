import { useRouter } from 'expo-router';
import { useState } from 'react';
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

import { addPerformance } from '@/lib/api';
import { useSession } from '@/lib/use-session';

export default function AddPerformanceScreen() {
  const router = useRouter();
  const { user, loading } = useSession();
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    const value = url.trim();
    if (!value) return;
    setSubmitting(true);
    setErr('');
    const res = await addPerformance(value);
    setSubmitting(false);
    if (res.ok && res.id) {
      // Replace so Back returns to the leaderboard, not this form.
      router.replace({ pathname: '/performance/[id]', params: { id: res.id } });
      return;
    }
    setErr(
      res.status === 401
        ? 'Your session expired — sign in again and retry.'
        : res.status === 403
          ? 'Verification required. Adding from the app unlocks once device attestation ships.'
          : res.status === 422
            ? 'That doesn’t look like a valid YouTube link.'
            : (res.error ?? `Could not add performance (${res.status}).`),
    );
  }

  // ---- Signed-out gate -----------------------------------------------------
  if (!loading && !user) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>
        </View>
        <View style={styles.centered}>
          <Text style={styles.signedOutTitle}>Sign in to add a performance</Text>
          <Pressable
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={() => router.push('/login')}
          >
            <Text style={styles.buttonText}>Sign in</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
      </View>
      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text style={styles.title}>Add a performance</Text>
        <Text style={styles.sub}>
          Paste a YouTube link. We embed it (never download) and add a Provisional AI Estimate.
        </Text>
        <TextInput
          style={styles.input}
          placeholder="https://youtu.be/…"
          placeholderTextColor="#6b7280"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          value={url}
          onChangeText={setUrl}
          onSubmitEditing={submit}
          returnKeyType="go"
        />
        {!!err && <Text style={styles.error}>{err}</Text>}
        <Pressable
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            (submitting || !url.trim()) && styles.buttonDisabled,
          ]}
          onPress={submit}
          disabled={submitting || !url.trim()}
        >
          {submitting ? (
            <ActivityIndicator color="#06281d" />
          ) : (
            <Text style={styles.buttonText}>Add performance</Text>
          )}
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  backText: { color: '#34d399', fontSize: 16, fontWeight: '600' },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 8, gap: 12 },
  centered: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 16 },
  title: { fontSize: 26, fontWeight: '800', color: '#fafafa' },
  sub: { fontSize: 14, color: '#9ca3af', lineHeight: 20 },
  input: {
    marginTop: 4,
    backgroundColor: '#171717',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fafafa',
    fontSize: 16,
  },
  error: { color: '#fb7185', fontSize: 13 },
  signedOutTitle: { fontSize: 20, fontWeight: '800', color: '#fafafa', textAlign: 'center' },
  button: {
    marginTop: 4,
    backgroundColor: '#34d399',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#06281d', fontSize: 16, fontWeight: '800' },
});
