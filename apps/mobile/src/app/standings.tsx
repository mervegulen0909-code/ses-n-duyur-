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

import { supabase } from '@/lib/supabase';

type PerfRow = {
  id: string;
  oembed_meta: { title?: string; authorName?: string } | null;
  elo_rating: number;
  battle_wins: number;
  battle_count: number;
};
type Item = {
  id: string;
  title: string;
  artist: string;
  elo: number;
  wins: number;
  battles: number;
};

// Top-three medal colors (mirrors the web RankBadge: gold / silver / bronze).
const MEDAL: Record<number, { bg: string; fg: string }> = {
  0: { bg: '#FCD34D', fg: '#1c1917' },
  1: { bg: '#D4D4D4', fg: '#1c1917' },
  2: { bg: '#B45309', fg: '#fef3c7' },
};

function winRate(wins: number, battles: number): number {
  return battles > 0 ? Math.round((wins / battles) * 100) : 0;
}

/**
 * Battle standings — the LEAGUE axis (Elo), parity with the web /standings page.
 * Reads performances directly from Supabase (RLS world-readable for active rows),
 * keeps only those that have battled, and ranks by Elo. Score lives on the home
 * leaderboard; this screen is purely head-to-head competition.
 */
export default function StandingsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('performances')
      .select('id, oembed_meta, elo_rating, battle_wins, battle_count')
      .eq('status', 'active');

    if (error) {
      setError(error.message);
      setState('error');
      return;
    }

    // Plain-column select, but oembed_meta is Json in the generated type; cast.
    const rows = (data ?? []) as unknown as PerfRow[];
    const mapped: Item[] = rows
      .filter((p) => p.battle_count > 0)
      .map((p) => {
        const meta = p.oembed_meta ?? {};
        return {
          id: p.id,
          title: meta.title ?? 'Untitled',
          artist: meta.authorName ?? '',
          elo: p.elo_rating,
          wins: p.battle_wins,
          battles: p.battle_count,
        };
      });
    // League axis: Elo desc, then who has battled more, then title.
    mapped.sort((a, b) => b.elo - a.elo || b.battles - a.battles || a.title.localeCompare(b.title));
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
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Text style={styles.brand}>
              ‹ Battle <Text style={styles.brandAccent}>standings</Text>
            </Text>
          </Pressable>
          <Pressable onPress={() => router.push('/battle')} hitSlop={8}>
            <Text style={styles.authLink}>Battle</Text>
          </Pressable>
        </View>
        <Text style={styles.sub}>Ranked by Elo · head-to-head battles</Text>
      </View>

      {state === 'loading' && <ActivityIndicator style={styles.spinner} color="#22D3EE" />}
      {state === 'error' && <Text style={styles.error}>Could not load: {error}</Text>}
      {state === 'ready' && (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>No battles yet. Open the Battle arena to start one.</Text>
          }
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={load} tintColor="#22D3EE" />
          }
          renderItem={({ item, index }) => {
            const medal = MEDAL[index];
            return (
              <Pressable
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() =>
                  router.push({ pathname: '/performance/[id]', params: { id: item.id } })
                }
              >
                <View style={[styles.rankWrap, medal && { backgroundColor: medal.bg }]}>
                  <Text style={[styles.rank, medal && { color: medal.fg }]}>{index + 1}</Text>
                </View>
                <View style={styles.rowMain}>
                  <Text style={styles.title} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.record} numberOfLines={1}>
                    {item.wins}-{item.battles - item.wins} · {winRate(item.wins, item.battles)}%
                    wins
                  </Text>
                </View>
                <Text style={styles.elo}>{Math.round(item.elo)}</Text>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  authLink: { color: '#22D3EE', fontSize: 15, fontWeight: '600' },
  brand: { fontSize: 22, fontWeight: '800', color: '#fafafa' },
  brandAccent: { color: '#22D3EE' },
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
  rankWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rank: { fontSize: 14, fontWeight: '700', color: '#6b7280' },
  rowMain: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600', color: '#fafafa' },
  record: { marginTop: 2, fontSize: 12, color: '#9ca3af' },
  elo: { fontSize: 17, fontWeight: '800', color: '#22D3EE', minWidth: 52, textAlign: 'right' },
});
