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

import { CRITERIA } from '@vocal-league/scoring';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/use-session';

type ScoreRel = { current_score: number | null };
type PerfRow = {
  id: string;
  oembed_meta: { title?: string; authorName?: string } | null;
  scores: ScoreRel | ScoreRel[] | null;
};
type Item = { id: string; title: string; artist: string; score: number | null };

function scoreOf(scores: ScoreRel | ScoreRel[] | null | undefined): number | null {
  if (!scores) return null;
  const row = Array.isArray(scores) ? scores[0] : scores;
  return row?.current_score ?? null;
}

export default function LeaderboardScreen() {
  const router = useRouter();
  const { user } = useSession();
  const [items, setItems] = useState<Item[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('performances')
      .select('id, oembed_meta, scores(current_score)')
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
      return {
        id: p.id,
        title: meta.title ?? 'Untitled',
        artist: meta.authorName ?? '',
        score: scoreOf(p.scores),
      };
    });
    mapped.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    setItems(mapped);
    setState('ready');
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.brand}>
            Vocal<Text style={styles.brandAccent}>League</Text>
          </Text>
          <View style={styles.navRow}>
            <Pressable onPress={() => router.push('/battle')} hitSlop={8}>
              <Text style={styles.authLink}>Battle</Text>
            </Pressable>
            {user ? (
              <Pressable onPress={() => router.push('/profile')} hitSlop={8}>
                <Text style={styles.authLink}>Profile</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => router.push('/login')} hitSlop={8}>
                <Text style={styles.authLink}>Sign in</Text>
              </Pressable>
            )}
          </View>
        </View>
        <Text style={styles.sub}>
          {user ? (user.email ?? 'Signed in') : `Leaderboard · AI-scored on ${CRITERIA.length} criteria`}
        </Text>
      </View>

      {state === 'loading' && <ActivityIndicator style={styles.spinner} color="#34d399" />}
      {state === 'error' && <Text style={styles.error}>Could not load: {error}</Text>}
      {state === 'ready' && (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No performances yet.</Text>}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor="#34d399" />}
          renderItem={({ item, index }) => (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => router.push({ pathname: '/performance/[id]', params: { id: item.id } })}
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
  authLink: { color: '#34d399', fontSize: 15, fontWeight: '600' },
  brand: { fontSize: 26, fontWeight: '800', color: '#fafafa' },
  brandAccent: { color: '#34d399' },
  sub: { marginTop: 4, fontSize: 13, color: '#9ca3af' },
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
  score: { fontSize: 17, fontWeight: '800', color: '#34d399', minWidth: 48, textAlign: 'right' },
});
