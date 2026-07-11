import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

type ScoreRel = { current_score: number | null; is_provisional?: boolean | null };
type PerfRow = {
  id: string;
  oembed_meta: { title?: string; authorName?: string } | null;
  scores: ScoreRel | ScoreRel[] | null;
};
type SongRow = { id: string; title: string; artist: string | null };
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

/**
 * Per-song ranking — "who sings THIS song best". Mirrors the global
 * leaderboard screen, scoped to one song_id.
 */
export default function SongScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [song, setSong] = useState<SongRow | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [songRes, perfRes] = await Promise.all([
      supabase.from('songs').select('id, title, artist').eq('id', id).maybeSingle(),
      supabase
        .from('performances')
        .select('id, oembed_meta, scores(current_score, is_provisional)')
        .eq('song_id', id)
        .eq('status', 'active'),
    ]);

    if (songRes.error || perfRes.error) {
      setError((songRes.error ?? perfRes.error)?.message ?? 'Unknown error');
      setState('error');
      return;
    }

    setSong((songRes.data as SongRow | null) ?? null);
    const rows = (perfRes.data ?? []) as unknown as PerfRow[];
    const mapped: Item[] = rows.map((p) => {
      const meta = p.oembed_meta ?? {};
      const score = scoreRowOf(p.scores);
      return {
        id: p.id,
        title: meta.title ?? t('Common.untitled'),
        artist: meta.authorName ?? '',
        score: score?.current_score ?? null,
        isProvisional: score?.is_provisional !== false,
      };
    });
    mapped.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    setItems(mapped);
    setState('ready');
  }, [id, t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backText}>{t('Common.back')}</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={2}>
          {song?.title ?? t('Song.fallback')}
          {song?.artist ? <Text style={styles.titleArtist}> — {song.artist}</Text> : null}
        </Text>
        <Text style={styles.sub}>{t('Song.sub')}</Text>
      </View>

      {state === 'loading' && <ActivityIndicator style={styles.spinner} color="#22D3EE" />}
      {state === 'error' && (
        <Text style={styles.error}>{t('Common.loadError', { error })}</Text>
      )}
      {state === 'ready' && (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>{t('Song.empty')}</Text>}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#22D3EE" />
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
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                {!!item.artist && (
                  <Text style={styles.rowArtist} numberOfLines={1}>
                    {item.artist}
                  </Text>
                )}
                {item.isProvisional && (
                  <Text style={styles.provisional}>{t('Common.provisionalBadge')}</Text>
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
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, gap: 6 },
  backText: { color: '#22D3EE', fontSize: 16, fontWeight: '600' },
  title: { fontSize: 22, fontWeight: '800', color: '#fafafa' },
  titleArtist: { fontWeight: '400', color: '#9ca3af' },
  sub: { fontSize: 13, color: '#9ca3af' },
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
  rowTitle: { fontSize: 15, fontWeight: '600', color: '#fafafa' },
  rowArtist: { marginTop: 2, fontSize: 12, color: '#9ca3af' },
  provisional: { marginTop: 4, fontSize: 10, fontWeight: '600', color: '#fbbf24' },
  score: { fontSize: 17, fontWeight: '800', color: '#22D3EE', minWidth: 48, textAlign: 'right' },
});
