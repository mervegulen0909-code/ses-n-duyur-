import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CRITERIA } from '@voxscore/scoring';
import { supabase } from '@/lib/supabase';
import { isOnboardingComplete } from '@/lib/onboarding';
import { useSession } from '@/lib/use-session';

type ScoreRel = { current_score: number | null; is_provisional?: boolean | null };
type PerfRow = {
  id: string;
  oembed_meta: { title?: string; authorName?: string } | null;
  scores: ScoreRel | ScoreRel[] | null;
};
type Item = {
  id: string;
  title: string;
  artist: string;
  score: number | null;
  isProvisional: boolean;
};

function scoreRowOf(scores: ScoreRel | ScoreRel[] | null | undefined): ScoreRel | null {
  if (!scores) return null;
  return (Array.isArray(scores) ? scores[0] : scores) ?? null;
}

export default function LeaderboardScreen() {
  const router = useRouter();
  const { user } = useSession();
  const [items, setItems] = useState<Item[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [gate, setGate] = useState<'checking' | 'ok'>('checking');

  useEffect(() => {
    isOnboardingComplete().then((done) => {
      if (!done) router.replace('/onboarding');
      else setGate('ok');
    });
  }, [router]);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('performances')
      .select('id, oembed_meta, scores(current_score, is_provisional)')
      .eq('status', 'active');

    if (error) {
      setError(error.message);
      setState('error');
      return;
    }

    // Supabase's generated Database type doesn't model the PostgREST embed here,
    // so it infers `never`; cast to our explicit row shape.
    const rows = (data ?? []) as unknown as PerfRow[];
    const mapped: Item[] = rows.map((p) => {
      const meta = p.oembed_meta ?? {};
      const score = scoreRowOf(p.scores);
      return {
        id: p.id,
        title: meta.title ?? 'Untitled',
        artist: meta.authorName ?? '',
        score: score?.current_score ?? null,
        // Column is NOT NULL default true; absent score → treat as provisional.
        isProvisional: score?.is_provisional !== false,
      };
    });
    mapped.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    setItems(mapped);
    setState('ready');
  }, []);

  useEffect(() => {
    if (gate === 'ok') load();
  }, [load, gate]);

  if (gate === 'checking') {
    return <View style={styles.safe} />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.brand}>
            Vox<Text style={styles.brandAccent}>Score</Text>
          </Text>
          <View style={styles.navRow}>
            <Pressable onPress={() => router.push('/battle')} hitSlop={8}>
              <Text style={styles.authLink}>Battle</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/voxscore-demo')} hitSlop={8}>
              <Text style={styles.authLink}>Demo</Text>
            </Pressable>
            {user ? (
              <>
                <Pressable onPress={() => router.push('/add')} hitSlop={8}>
                  <Text style={styles.authLink}>+ Add</Text>
                </Pressable>
                <Pressable onPress={() => router.push('/profile')} hitSlop={8}>
                  <Text style={styles.authLink}>Profile</Text>
                </Pressable>
              </>
            ) : (
              <Pressable onPress={() => router.push('/login')} hitSlop={8}>
                <Text style={styles.authLink}>Sign in</Text>
              </Pressable>
            )}
          </View>
        </View>
        <Text style={styles.sub}>
          {user
            ? (user.email ?? 'Signed in')
            : `Leaderboard · AI-scored on ${CRITERIA.length} criteria`}
        </Text>
        <Pressable onPress={() => router.push('/standings')} hitSlop={8}>
          <Text style={styles.standingsLink}>Battle standings →</Text>
        </Pressable>
      </View>

      {state === 'loading' && <ActivityIndicator style={styles.spinner} color="#22D3EE" />}
      {state === 'error' && <Text style={styles.error}>Could not load: {error}</Text>}
      {state === 'ready' && (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No performances yet.</Text>}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={load} tintColor="#22D3EE" />
          }
          renderItem={({ item, index }) => (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() =>
                router.push({ pathname: '/performance/[id]', params: { id: item.id } })
              }
            >
              <Text style={styles.rank}>{index + 1}</Text>
              <View style={styles.rowMain}>
                <Text style={styles.title} numberOfLines={1}>
                  {item.title}
                </Text>
                {!!item.artist && (
                  <Text style={styles.artist} numberOfLines={1}>
                    {item.artist}
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
  navRow: { flexDirection: 'row', gap: 16 },
  authLink: { color: '#22D3EE', fontSize: 15, fontWeight: '600' },
  brand: { fontSize: 26, fontWeight: '800', color: '#fafafa' },
  brandAccent: { color: '#22D3EE' },
  sub: { marginTop: 4, fontSize: 13, color: '#9ca3af' },
  standingsLink: { marginTop: 8, fontSize: 13, fontWeight: '600', color: '#22D3EE' },
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
  rank: { width: 24, textAlign: 'center', fontSize: 15, fontWeight: '700', color: '#6b7280' },
  rowMain: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600', color: '#fafafa' },
  artist: { marginTop: 2, fontSize: 12, color: '#9ca3af' },
  provisional: { marginTop: 4, fontSize: 10, fontWeight: '600', color: '#fbbf24' },
  score: { fontSize: 17, fontWeight: '800', color: '#22D3EE', minWidth: 48, textAlign: 'right' },
});
