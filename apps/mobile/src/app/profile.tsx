import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LegalLinks } from '@/components/legal-links';
import { deleteAccount } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/use-session';

type Profile = { handle: string; reputation: number };

type ScoreRel = { current_score: number | null; is_provisional?: boolean | null };
type PerfRow = {
  id: string;
  status: string;
  oembed_meta: { title?: string; authorName?: string } | null;
  scores: ScoreRel | ScoreRel[] | null;
};
type Item = {
  id: string;
  title: string;
  status: string;
  score: number | null;
  isProvisional: boolean;
};

function scoreRowOf(scores: ScoreRel | ScoreRel[] | null | undefined): ScoreRel | null {
  if (!scores) return null;
  return (Array.isArray(scores) ? scores[0] : scores) ?? null;
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, loading: sessionLoading } = useSession();
  // Key data-loading on the STABLE id string, not the `user` object identity:
  // Supabase mints a fresh user object on every token refresh, which would
  // otherwise re-trigger the focus effect (loading-spinner flash) mid-session.
  const userId = user?.id ?? null;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // The actual destructive call: delete server-side, then sign out and leave.
  const runDelete = useCallback(async () => {
    setDeleting(true);
    const res = await deleteAccount();
    setDeleting(false);
    if (res.ok) {
      await supabase.auth.signOut();
      router.replace('/');
    } else {
      const msg =
        res.status === 401
          ? 'Your session expired — please sign in again and retry.'
          : (res.error ?? 'Could not delete your account. Please try again.');
      Alert.alert('Deletion failed', msg);
    }
  }, [router]);

  // Store-required (Apple 5.1.1(v) / Google Play): in-app account deletion.
  // Genuinely two-step destructive confirm — this permanently cascades ALL of
  // the user's data server-side, so we gate it behind two deliberate taps.
  const onDeleteAccount = useCallback(() => {
    // Step 1 — explain what is erased and that it is irreversible.
    Alert.alert(
      'Delete account',
      'This permanently deletes your account and all your performances, scores, votes, and listen history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          // Step 2 — final confirmation immediately before the destructive call.
          onPress: () =>
            Alert.alert(
              'Are you sure?',
              'This is your last chance to cancel. Your account will be permanently deleted.',
              [
                { text: 'Keep my account', style: 'cancel' },
                { text: 'Delete forever', style: 'destructive', onPress: () => void runDelete() },
              ],
            ),
        },
      ],
    );
  }, [runDelete]);

  const load = useCallback(async () => {
    if (!userId) return;

    // Profile + performances both read directly through supabase (RLS-protected):
    // profiles is world-readable; performances are visible to their owner even
    // when not 'active'. No API/Bearer needed for these reads.
    const [profileRes, perfRes] = await Promise.all([
      supabase.from('profiles').select('handle, reputation').eq('id', userId).single(),
      supabase
        .from('performances')
        .select('id, status, oembed_meta, scores(current_score, is_provisional)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
    ]);

    if (profileRes.error) {
      setError(profileRes.error.message);
      setState('error');
      return;
    }
    if (perfRes.error) {
      setError(perfRes.error.message);
      setState('error');
      return;
    }

    setProfile(profileRes.data as unknown as Profile);

    // Supabase's generated Database type doesn't model the PostgREST embed here,
    // so it infers `never`; cast to our explicit row shape.
    const rows = (perfRes.data ?? []) as unknown as PerfRow[];
    setItems(
      rows.map((p) => {
        const meta = p.oembed_meta ?? {};
        const score = scoreRowOf(p.scores);
        return {
          id: p.id,
          title: meta.title ?? 'Untitled',
          status: p.status,
          score: score?.current_score ?? null,
          // Column is NOT NULL default true; absent score → treat as provisional.
          isProvisional: score?.is_provisional !== false,
        };
      }),
    );
    setState('ready');
  }, [userId]);

  // Refetch on focus so "Your performances" reflects anything added since the
  // last visit (not just the first mount).
  useFocusEffect(
    useCallback(() => {
      if (sessionLoading) return;
      if (!userId) {
        setState('ready');
        return;
      }
      setState('loading');
      load();
    }, [sessionLoading, userId, load]),
  );

  // Pull-to-refresh with a visible spinner.
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  // ---- Signed-out state ----------------------------------------------------
  if (!sessionLoading && !user) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>
        </View>
        <View style={styles.signedOut}>
          <Text style={styles.signedOutTitle}>You’re not signed in</Text>
          <Text style={styles.signedOutSub}>Sign in to see your profile and performances.</Text>
          <Pressable
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={() => router.push('/login')}
          >
            <Text style={styles.buttonText}>Sign in</Text>
          </Pressable>
          <LegalLinks />
        </View>
      </SafeAreaView>
    );
  }

  // ---- Signed-in state -----------------------------------------------------
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>
          <Pressable onPress={() => supabase.auth.signOut()} hitSlop={8}>
            <Text style={styles.authLink}>Sign out</Text>
          </Pressable>
        </View>

        <Text style={styles.handle} numberOfLines={1}>
          {profile ? `@${profile.handle}` : (user?.email ?? 'Your profile')}
        </Text>
        <View style={styles.repRow}>
          <Text style={styles.repValue}>{profile?.reputation ?? 0}</Text>
          <Text style={styles.repLabel}>reputation</Text>
        </View>
      </View>

      {state === 'loading' && <ActivityIndicator style={styles.spinner} color="#22D3EE" />}
      {state === 'error' && <Text style={styles.error}>Could not load: {error}</Text>}
      {state === 'ready' && (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={<Text style={styles.sectionLabel}>Your performances</Text>}
          ListEmptyComponent={
            <Text style={styles.empty}>You haven’t added any performances yet.</Text>
          }
          ListFooterComponent={
            <>
              <Pressable
                accessibilityRole="button"
                onPress={onDeleteAccount}
                disabled={deleting}
                style={({ pressed }) => [
                  styles.deleteButton,
                  pressed && styles.rowPressed,
                  deleting && styles.deleteButtonDisabled,
                ]}
              >
                {deleting ? (
                  <ActivityIndicator color="#fb7185" />
                ) : (
                  <Text style={styles.deleteButtonText}>Delete account</Text>
                )}
              </Pressable>
              <LegalLinks />
            </>
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#22D3EE" />
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() =>
                router.push({ pathname: '/performance/[id]', params: { id: item.id } })
              }
            >
              <View style={styles.rowMain}>
                <Text style={styles.title} numberOfLines={1}>
                  {item.title}
                </Text>
                {item.status !== 'active' && (
                  <Text style={styles.status} numberOfLines={1}>
                    {item.status}
                  </Text>
                )}
                {item.isProvisional && (
                  <Text style={styles.provisional}>Provisional AI Estimate</Text>
                )}
              </View>
              <Text style={styles.score}>{item.score != null ? item.score.toFixed(1) : '—'}</Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backText: { color: '#22D3EE', fontSize: 16, fontWeight: '600' },
  authLink: { color: '#22D3EE', fontSize: 15, fontWeight: '600' },
  handle: { marginTop: 12, fontSize: 26, fontWeight: '800', color: '#fafafa' },
  repRow: { marginTop: 4, flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  repValue: { fontSize: 17, fontWeight: '800', color: '#22D3EE', fontVariant: ['tabular-nums'] },
  repLabel: { fontSize: 13, color: '#9ca3af' },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  spinner: { marginTop: 40 },
  error: { margin: 20, color: '#fb7185' },
  empty: { marginTop: 40, textAlign: 'center', color: '#9ca3af' },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#171717',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  rowPressed: { opacity: 0.6 },
  rowMain: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600', color: '#fafafa' },
  status: { marginTop: 2, fontSize: 12, color: '#fbbf24', textTransform: 'capitalize' },
  provisional: { marginTop: 4, fontSize: 10, fontWeight: '600', color: '#fbbf24' },
  score: { fontSize: 17, fontWeight: '800', color: '#22D3EE', minWidth: 48, textAlign: 'right' },
  // Danger zone — store-required account deletion.
  deleteButton: {
    marginTop: 28,
    borderWidth: 1,
    borderColor: '#7f1d1d',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  deleteButtonDisabled: { opacity: 0.5 },
  deleteButtonText: { color: '#fb7185', fontSize: 15, fontWeight: '700' },
  // Signed-out prompt
  signedOut: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
  signedOutTitle: { fontSize: 22, fontWeight: '800', color: '#fafafa', textAlign: 'center' },
  signedOutSub: { fontSize: 14, color: '#9ca3af', textAlign: 'center' },
  button: {
    marginTop: 8,
    backgroundColor: '#22D3EE',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: '#06281d', fontSize: 16, fontWeight: '800' },
});
