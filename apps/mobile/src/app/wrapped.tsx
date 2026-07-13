import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/use-session';

type Wrapped = {
  wins: number;
  losses: number;
  votes: number;
  listens: number;
  predictions: number;
};
const ZERO: Wrapped = { wins: 0, losses: 0, votes: 0, listens: 0, predictions: 0 };

export default function WrappedScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user, loading: authLoading } = useSession();
  const [data, setData] = useState<Wrapped>(ZERO);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: season } = await supabase
      .from('seasons')
      .select('id, starts_at, ends_at')
      .is('ends_at', null)
      .order('starts_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: profile } = await supabase
      .from('profiles')
      .select('prediction_points')
      .eq('id', user.id)
      .maybeSingle();
    if (!season) {
      setData({ ...ZERO, predictions: profile?.prediction_points ?? 0 });
      setLoading(false);
      return;
    }

    const { data: performances } = await supabase
      .from('performances')
      .select('id')
      .eq('user_id', user.id);
    const ids = (performances ?? []).map((row) => row.id);
    const list = ids.join(',');
    const { data: battles } = ids.length
      ? await supabase
          .from('battles')
          .select('winner_performance_id')
          .eq('status', 'closed')
          .eq('season_id', season.id)
          .or(`perf_a.in.(${list}),perf_b.in.(${list})`)
      : { data: [] };
    const mine = new Set(ids);
    let wins = 0;
    let losses = 0;
    for (const battle of battles ?? []) {
      if (!battle.winner_performance_id) continue;
      if (mine.has(battle.winner_performance_id)) wins += 1;
      else losses += 1;
    }

    let voteQuery = supabase
      .from('battle_votes')
      .select('id', { count: 'exact', head: true })
      .eq('voter_id', user.id)
      .eq('is_verified', true)
      .gte('created_at', season.starts_at);
    let listenQuery = supabase
      .from('verified_listens')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_valid', true)
      .gte('created_at', season.starts_at);
    if (season.ends_at) {
      voteQuery = voteQuery.lte('created_at', season.ends_at);
      listenQuery = listenQuery.lte('created_at', season.ends_at);
    }
    const [{ count: votes }, { count: listens }] = await Promise.all([voteQuery, listenQuery]);
    setData({
      wins,
      losses,
      votes: votes ?? 0,
      listens: listens ?? 0,
      predictions: profile?.prediction_points ?? 0,
    });
    setLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      if (user) void load();
    }, [load, user]),
  );

  if (authLoading) return <View style={styles.safe} />;
  if (!user) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.title}>{t('Wrapped.title')}</Text>
          <Pressable style={styles.primary} onPress={() => router.push('/login')}>
            <Text style={styles.primaryText}>{t('Common.signIn')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const stats = [
    ['wins', data.wins],
    ['losses', data.losses],
    ['votes', data.votes],
    ['listens', data.listens],
    ['predictions', data.predictions],
  ] as const;
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>{t('Common.back')}</Text>
        </Pressable>
        <Text style={styles.eyebrow}>VOXSCORE WRAPPED</Text>
        <Text style={styles.title}>{t('Wrapped.title')}</Text>
        {loading ? (
          <ActivityIndicator color="#a78bfa" style={styles.spinner} />
        ) : (
          <View style={styles.grid}>
            {stats.map(([key, value]) => (
              <View key={key} style={[styles.card, key === 'predictions' && styles.wide]}>
                <Text style={styles.value}>{value}</Text>
                <Text style={styles.label}>{t(`Wrapped.${key}`)}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 20, paddingBottom: 40 },
  back: { color: '#9ca3af', fontWeight: '600' },
  eyebrow: { marginTop: 28, color: '#a78bfa', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  title: { marginTop: 6, color: '#fafafa', fontSize: 34, fontWeight: '900' },
  spinner: { marginTop: 50 },
  grid: { marginTop: 28, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    width: '48%',
    minHeight: 140,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#262626',
    backgroundColor: '#171717',
    padding: 16,
  },
  wide: { width: '100%' },
  value: { color: '#a78bfa', fontSize: 44, fontWeight: '900' },
  label: {
    marginTop: 6,
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  primary: {
    marginTop: 20,
    backgroundColor: '#a78bfa',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  primaryText: { color: '#1e1b4b', fontWeight: '900' },
});
