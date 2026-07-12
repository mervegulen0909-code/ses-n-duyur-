import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SONG_CATEGORIES, type SongCategory } from '@voxscore/core';
import {
  myPerformanceRequests,
  submitPerformanceRequest,
  type PerformanceRequestRow,
} from '@/lib/api';
import { useSession } from '@/lib/use-session';

const CATEGORY_KEY: Record<SongCategory, string> = {
  pop: 'categoryPop',
  rock: 'categoryRock',
  'rnb-soul': 'categoryRnbSoul',
  ballad: 'categoryBallad',
  'turkish-global': 'categoryTurkishGlobal',
  'indie-alternative': 'categoryIndieAlternative',
  'musical-classical': 'categoryMusicalClassical',
  other: 'categoryOther',
};

function errorMessage(
  t: (key: string, opts?: Record<string, unknown>) => string,
  status: number,
  error?: string,
): string {
  if (status === 401) return t('Request.sessionExpired');
  if (status === 409)
    return error?.includes('pending') ? t('Request.duplicatePending') : t('Request.duplicateVideo');
  if (status === 422) return t('Request.invalidUrl');
  return error ?? t('Request.genericError', { status });
}

function StatusBadge({ status }: { status: PerformanceRequestRow['status'] }) {
  const { t } = useTranslation();
  const style =
    status === 'approved'
      ? styles.badgeApproved
      : status === 'rejected'
        ? styles.badgeRejected
        : styles.badgePending;
  const key =
    status === 'approved'
      ? 'statusApproved'
      : status === 'rejected'
        ? 'statusRejected'
        : 'statusPending';
  return (
    <View style={[styles.badge, style]}>
      <Text style={styles.badgeText}>{t(`Request.${key}`)}</Text>
    </View>
  );
}

function MyRequests({ requests }: { requests: PerformanceRequestRow[] }) {
  const { t } = useTranslation();
  return (
    <View style={styles.requestsSection}>
      <Text style={styles.requestsHeading}>{t('Request.myRequestsHeading')}</Text>
      {requests.length === 0 ? (
        <Text style={styles.requestsEmpty}>{t('Request.noRequests')}</Text>
      ) : (
        requests.map((r) => (
          <View key={r.id} style={styles.requestRow}>
            <View style={styles.requestRowTop}>
              <Text style={styles.requestUrl} numberOfLines={1}>
                {r.youtube_url}
              </Text>
              <StatusBadge status={r.status} />
            </View>
            {r.status === 'rejected' && r.rejection_reason && (
              <Text style={styles.requestReason}>
                {t('Request.rejectionReasonPrefix', { reason: r.rejection_reason })}
              </Text>
            )}
          </View>
        ))
      )}
    </View>
  );
}

export default function AddPerformanceScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user, loading } = useSession();
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState<SongCategory>('pop');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [successId, setSuccessId] = useState<string | null>(null);
  const [requests, setRequests] = useState<PerformanceRequestRow[]>([]);

  useEffect(() => {
    if (!user) return;
    myPerformanceRequests().then((res) => {
      if (res.ok) setRequests(res.requests);
    });
  }, [user, successId]);

  async function submit() {
    const value = url.trim();
    if (!value) return;
    setSubmitting(true);
    setErr('');
    const res = await submitPerformanceRequest(value, category, note.trim() || undefined);
    setSubmitting(false);
    if (res.ok && res.id) {
      setSuccessId(res.id);
      setUrl('');
      setNote('');
      return;
    }
    setErr(errorMessage(t, res.status, res.error));
  }

  // ---- Signed-out gate -----------------------------------------------------
  if (!loading && !user) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.backText}>{t('Common.back')}</Text>
          </Pressable>
        </View>
        <View style={styles.centered}>
          <Text style={styles.signedOutTitle}>{t('Request.signInPrompt')}</Text>
          <Pressable
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={() => router.push('/login')}
          >
            <Text style={styles.buttonText}>{t('Common.signIn')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backText}>{t('Common.back')}</Text>
        </Pressable>
      </View>
      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12 }}>
          <Text style={styles.title}>{t('Request.title')}</Text>
          <Text style={styles.sub}>{t('Request.subtitle')}</Text>

          {successId ? (
            <View style={styles.successBox}>
              <Text style={styles.successTitle}>{t('Request.successTitle')}</Text>
              <Text style={styles.successBody}>{t('Request.successBody', { id: successId })}</Text>
              <Pressable onPress={() => setSuccessId(null)} hitSlop={8}>
                <Text style={styles.successAction}>{t('Request.submitAnother')}</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <TextInput
                style={styles.input}
                placeholder={t('Request.urlPlaceholder')}
                placeholderTextColor="#6b7280"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                value={url}
                onChangeText={setUrl}
                returnKeyType="next"
              />

              <Text style={styles.label}>{t('Request.categoryLabel')}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                {SONG_CATEGORIES.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => setCategory(c)}
                    style={[styles.chip, category === c && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, category === c && styles.chipTextActive]}>
                      {t(`Request.${CATEGORY_KEY[c]}`, { defaultValue: c })}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <TextInput
                style={[styles.input, styles.noteInput]}
                placeholder={t('Request.notePlaceholder')}
                placeholderTextColor="#6b7280"
                value={note}
                onChangeText={setNote}
                multiline
                maxLength={1000}
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
                  <Text style={styles.buttonText}>{t('Request.submit')}</Text>
                )}
              </Pressable>
              <Text style={styles.reviewNote}>{t('Request.reviewNote')}</Text>
            </>
          )}

          <MyRequests requests={requests} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  backText: { color: '#22D3EE', fontSize: 16, fontWeight: '600' },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 8 },
  centered: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 16 },
  title: { fontSize: 26, fontWeight: '800', color: '#fafafa' },
  sub: { fontSize: 14, color: '#9ca3af', lineHeight: 20 },
  label: { fontSize: 13, color: '#9ca3af', marginTop: 4 },
  input: {
    marginTop: 4,
    backgroundColor: '#171717',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fafafa',
    fontSize: 16,
  },
  noteInput: { minHeight: 64, textAlignVertical: 'top' },
  chipRow: { gap: 8, paddingVertical: 4 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#404040',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: { borderColor: '#22D3EE', backgroundColor: 'rgba(34,211,238,0.12)' },
  chipText: { color: '#9ca3af', fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#22D3EE' },
  error: { color: '#fb7185', fontSize: 13 },
  reviewNote: { color: '#525252', fontSize: 12 },
  signedOutTitle: { fontSize: 20, fontWeight: '800', color: '#fafafa', textAlign: 'center' },
  button: {
    marginTop: 4,
    backgroundColor: '#22D3EE',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#06281d', fontSize: 16, fontWeight: '800' },
  successBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.4)',
    backgroundColor: 'rgba(52,211,153,0.08)',
    padding: 16,
    gap: 6,
  },
  successTitle: { color: '#34D399', fontSize: 16, fontWeight: '700' },
  successBody: { color: '#9ca3af', fontSize: 13 },
  successAction: { color: '#22D3EE', fontSize: 14, fontWeight: '600', marginTop: 4 },
  requestsSection: { marginTop: 24, gap: 8, paddingBottom: 24 },
  requestsHeading: { color: '#e5e5e5', fontSize: 14, fontWeight: '700' },
  requestsEmpty: { color: '#6b7280', fontSize: 13 },
  requestRow: {
    backgroundColor: '#171717',
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  requestRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  requestUrl: { flex: 1, color: '#d4d4d4', fontSize: 12 },
  requestReason: { color: '#fca5a5', fontSize: 12 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgePending: { backgroundColor: 'rgba(245,158,11,0.15)' },
  badgeApproved: { backgroundColor: 'rgba(52,211,153,0.15)' },
  badgeRejected: { backgroundColor: 'rgba(251,113,133,0.15)' },
  badgeText: { color: '#e5e5e5', fontSize: 11, fontWeight: '700' },
});
