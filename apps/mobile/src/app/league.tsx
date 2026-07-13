import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/use-session';

type Member = { id: string; handle: string; points: number; isMe: boolean };

function currentWeekStart(now = new Date()): string {
  const day = now.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff))
    .toISOString()
    .slice(0, 10);
}

export default function WeeklyLeagueScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user, loading: authLoading } = useSession();
  const [members, setMembers] = useState<Member[]>([]);
  const [tier, setTier] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');

  const load = useCallback(async () => {
    if (!user) return;
    setState('loading');
    const weekStart = currentWeekStart();
    const { data: own, error: ownError } = await supabase
      .from('league_memberships')
      .select('cohort_id')
      .eq('user_id', user.id)
      .eq('week_start', weekStart)
      .maybeSingle();
    if (ownError) return setState('error');
    if (!own) return setState('empty');

    const [{ data: cohort }, { data: rows, error: rowsError }] = await Promise.all([
      supabase.from('league_cohorts').select('tier').eq('id', own.cohort_id).maybeSingle(),
      supabase
        .from('league_memberships')
        .select('user_id, points')
        .eq('cohort_id', own.cohort_id)
        .eq('week_start', weekStart),
    ]);
    if (rowsError) return setState('error');
    const ids = (rows ?? []).map((row) => row.user_id);
    const { data: profiles, error: profileError } = ids.length
      ? await supabase.from('profiles').select('id, handle').in('id', ids)
      : { data: [], error: null };
    if (profileError) return setState('error');
    const handle = new Map((profiles ?? []).map((profile) => [profile.id, profile.handle]));
    setMembers(
      (rows ?? [])
        .map((row) => ({
          id: row.user_id,
          handle: handle.get(row.user_id) ?? t('League.listener'),
          points: row.points,
          isMe: row.user_id === user.id,
        }))
        .sort((a, b) => b.points - a.points || a.handle.localeCompare(b.handle)),
    );
    setTier(cohort?.tier ?? 0);
    setState('ready');
  }, [t, user]);

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
          <Text style={styles.title}>{t('League.title')}</Text>
          <Text style={styles.sub}>{t('League.signIn')}</Text>
          <Pressable style={styles.primary} onPress={() => router.push('/login')}>
            <Text style={styles.primaryText}>{t('Common.signIn')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>{t('Common.back')}</Text>
        </Pressable>
        <Text style={styles.eyebrow}>{t('League.weekly')}</Text>
        <Text style={styles.title}>{t('League.title')}</Text>
        {state === 'ready' && (
          <Text style={styles.tier}>{t(`League.tier${Math.max(0, Math.min(3, tier))}`)}</Text>
        )}
      </View>
      {state === 'loading' && <ActivityIndicator color="#34d399" style={styles.spinner} />}
      {state === 'empty' && <Text style={styles.message}>{t('League.empty')}</Text>}
      {state === 'error' && <Text style={styles.error}>{t('League.error')}</Text>}
      {state === 'ready' && (
        <FlatList
          data={members}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => (
            <View style={[styles.row, item.isMe && styles.myRow]}>
              <Text style={styles.rank}>{index + 1}</Text>
              <Text style={styles.handle} numberOfLines={1}>
                @{item.handle}
              </Text>
              <Text style={styles.points}>{t('League.points', { count: item.points })}</Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 18 },
  back: { color: '#9ca3af', fontWeight: '600' },
  eyebrow: { marginTop: 24, color: '#34d399', fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  title: { marginTop: 5, color: '#fafafa', fontSize: 30, fontWeight: '900' },
  sub: { marginTop: 8, color: '#9ca3af', textAlign: 'center' },
  tier: { marginTop: 8, color: '#67e8f9', fontSize: 13, fontWeight: '700' },
  spinner: { marginTop: 48 },
  message: { margin: 24, color: '#9ca3af', lineHeight: 22 },
  error: { margin: 24, color: '#fb7185' },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#171717',
    borderRadius: 14,
    padding: 15,
  },
  myRow: { borderWidth: 1, borderColor: '#34d399', backgroundColor: '#0f211a' },
  rank: { width: 28, color: '#737373', fontSize: 15, fontWeight: '800', textAlign: 'center' },
  handle: { flex: 1, color: '#fafafa', fontWeight: '700' },
  points: { color: '#34d399', fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  primary: {
    marginTop: 20,
    backgroundColor: '#34d399',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  primaryText: { color: '#052e22', fontWeight: '900' },
});
