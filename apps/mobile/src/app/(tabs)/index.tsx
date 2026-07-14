import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CRITERIA } from '@voxscore/scoring';
import { COLORS, FONTS } from '@/constants/brand';
import {
  CategoryChips,
  FeaturedHero,
  SkeletonCard,
  SongCard,
} from '@/components/home-visuals';
import { useCategoryLabel } from '@/lib/category-labels';
import {
  buildSongFeed,
  categoriesInFeed,
  type PerfFeedRow,
  type SongEntry,
  type SongMetaRow,
} from '@/lib/home-feed';
import { isOnboardingComplete } from '@/lib/onboarding';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/use-session';

/** Secondary features that aren't top-level tabs — reachable as quick links. */
const QUICK_LINKS: { href: Href; icon: keyof typeof Ionicons.glyphMap; key: string }[] = [
  { href: '/league' as Href, icon: 'trophy-outline', key: 'League.short' },
  { href: '/standings' as Href, icon: 'podium-outline', key: 'Standings.title' },
  { href: '/wrapped' as Href, icon: 'sparkles-outline', key: 'Wrapped.short' },
];

export default function HomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user } = useSession();
  const labelFor = useCategoryLabel();

  const [entries, setEntries] = useState<SongEntry[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [gate, setGate] = useState<'checking' | 'ok'>('checking');
  const [refreshing, setRefreshing] = useState(false);
  const [category, setCategory] = useState<string | null>(null);

  useEffect(() => {
    isOnboardingComplete().then((done) => {
      if (!done) router.replace('/onboarding');
      else setGate('ok');
    });
  }, [router]);

  const load = useCallback(async () => {
    const [perfRes, songRes] = await Promise.all([
      supabase
        .from('performances')
        .select('id, song_id, oembed_meta, scores(current_score, is_provisional)')
        .eq('status', 'active'),
      supabase.from('songs').select('id, title, artist, category'),
    ]);

    if (perfRes.error || songRes.error) {
      setError((perfRes.error ?? songRes.error)?.message ?? 'Unknown error');
      setState('error');
      return;
    }

    // PostgREST embeds aren't modeled by the generated types; cast to our shapes.
    const perfs = (perfRes.data ?? []) as unknown as PerfFeedRow[];
    const songs = (songRes.data ?? []) as unknown as SongMetaRow[];
    setEntries(buildSongFeed(songs, perfs));
    setState('ready');
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (gate === 'ok') load();
    }, [load, gate]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const categories = useMemo(() => categoriesInFeed(entries), [entries]);
  const visible = useMemo(
    () => (category ? entries.filter((e) => e.category === category) : entries),
    [entries, category],
  );
  const featured = visible[0] ?? null;
  const rest = visible.slice(1);

  const openSong = useCallback(
    (songId: string) => router.push({ pathname: '/song/[id]', params: { id: songId } }),
    [router],
  );

  if (gate === 'checking') return <View style={styles.safe} />;

  const header = (
    <View style={styles.headerBlock}>
      <View style={styles.topBar}>
        <Text style={styles.brand}>
          Vox<Text style={styles.brandAccent}>Score</Text>
        </Text>
        <Pressable
          onPress={() => router.push(user ? '/profile' : '/login')}
          hitSlop={10}
          style={styles.avatarBtn}
          accessibilityLabel={user ? t('Leaderboard.profile') : t('Common.signIn')}
        >
          <Ionicons
            name={user ? 'person' : 'log-in-outline'}
            size={18}
            color={COLORS.cyan}
          />
        </Pressable>
      </View>
      <Text style={styles.sub}>{t('Leaderboard.signedOutSub', { count: CRITERIA.length })}</Text>

      <View style={styles.quickRow}>
        {QUICK_LINKS.map((q) => (
          <Pressable
            key={q.key}
            onPress={() => router.push(q.href)}
            style={({ pressed }) => [styles.quickChip, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name={q.icon} size={13} color={COLORS.muted} />
            <Text style={styles.quickChipText}>{t(q.key)}</Text>
          </Pressable>
        ))}
      </View>

      {state === 'ready' && featured && (
        <View style={styles.heroWrap}>
          <FeaturedHero entry={featured} categoryLabel={labelFor(featured.category)} onPress={openSong} />
        </View>
      )}

      {state === 'ready' && categories.length > 1 && (
        <CategoryChips
          categories={categories}
          active={category}
          labelFor={labelFor}
          onSelect={setCategory}
        />
      )}

      {state === 'ready' && rest.length > 0 && (
        <Text style={styles.sectionHeading}>{t('Home.songsHeading')}</Text>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {state === 'loading' && (
        <View style={styles.loadingWrap}>
          {header}
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </View>
      )}
      {state === 'error' && (
        <View style={styles.loadingWrap}>
          {header}
          <Text style={styles.error}>{t('Common.loadError', { error })}</Text>
        </View>
      )}
      {state === 'ready' && (
        <FlatList
          data={rest}
          keyExtractor={(e) => e.songId}
          ListHeaderComponent={header}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            featured ? null : <Text style={styles.empty}>{t('Home.empty')}</Text>
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.cyan} />
          }
          renderItem={({ item, index }) => (
            <SongCard
              entry={item}
              rank={index + 2}
              categoryLabel={labelFor(item.category)}
              onPress={openSong}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.surface },
  loadingWrap: { paddingHorizontal: 16, gap: 10 },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },

  headerBlock: { paddingTop: 4, paddingBottom: 6, gap: 12 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { fontFamily: FONTS.sansBold, fontSize: 26, color: COLORS.inkBright },
  brandAccent: { color: COLORS.cyan },
  avatarBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.raised,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sub: { fontFamily: FONTS.sans, fontSize: 13, color: COLORS.muted, marginTop: -6 },

  quickRow: { flexDirection: 'row', gap: 8 },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  quickChipText: { fontFamily: FONTS.sansSemibold, fontSize: 11.5, color: COLORS.muted },

  heroWrap: { marginTop: 2 },
  sectionHeading: {
    fontFamily: FONTS.sansBold,
    fontSize: 16,
    color: COLORS.ink,
    marginTop: 4,
  },

  error: { color: COLORS.rose, fontFamily: FONTS.sans, marginTop: 20 },
  empty: { marginTop: 40, textAlign: 'center', color: COLORS.muted, fontFamily: FONTS.sans },
});
