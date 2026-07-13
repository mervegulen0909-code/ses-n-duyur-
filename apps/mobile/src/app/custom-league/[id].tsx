import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { customLeagueDetail, type CustomLeagueDetail } from '@/lib/api';
import { WEB_BASE } from '@/lib/config';

export default function CustomLeagueDetailScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detail, setDetail] = useState<CustomLeagueDetail | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!id) return;
    customLeagueDetail(id).then((result) => {
      if (result.ok && result.detail) setDetail(result.detail);
      else setError(true);
    });
  }, [id]);

  async function invite() {
    if (!detail) return;
    const url = `${WEB_BASE}/leagues/join?code=${detail.league.joinCode}`;
    await Share.share({ message: t('Leagues.invite', { name: detail.league.name, url }) });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>{t('Common.back')}</Text>
        </Pressable>
        {detail && (
          <>
            <Text style={styles.eyebrow}>{t('Leagues.currentSeason')}</Text>
            <Text style={styles.title}>{detail.league.name}</Text>
            <Pressable style={styles.invite} onPress={() => void invite()}>
              <Text style={styles.inviteText}>
                {t('Leagues.inviteCrew')} · {detail.league.joinCode}
              </Text>
            </Pressable>
          </>
        )}
      </View>
      {!detail && !error && <ActivityIndicator color="#22d3ee" style={styles.spinner} />}
      {error && <Text style={styles.error}>{t('Leagues.error')}</Text>}
      {detail && (
        <FlatList
          data={detail.members}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => (
            <View style={[styles.row, item.isMe && styles.myRow]}>
              <Text style={styles.rank}>{index + 1}</Text>
              <Text style={styles.handle}>@{item.handle}</Text>
              <View>
                <Text style={styles.wins}>{t('Leagues.wins', { count: item.wins })}</Text>
                <Text style={styles.points}>
                  {t('Leagues.points', { count: item.predictionPoints })}
                </Text>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { padding: 20 },
  back: { color: '#9ca3af', fontWeight: '600' },
  eyebrow: { marginTop: 24, color: '#22d3ee', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  title: { marginTop: 5, color: '#fafafa', fontSize: 30, fontWeight: '900' },
  invite: {
    marginTop: 16,
    alignSelf: 'flex-start',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#155e75',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  inviteText: { color: '#67e8f9', fontWeight: '800' },
  spinner: { marginTop: 40 },
  error: { margin: 20, color: '#fb7185' },
  list: { paddingHorizontal: 16, paddingBottom: 40, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    backgroundColor: '#171717',
    padding: 15,
  },
  myRow: { borderWidth: 1, borderColor: '#22d3ee' },
  rank: { width: 28, color: '#737373', fontWeight: '800', textAlign: 'center' },
  handle: { flex: 1, color: '#fafafa', fontWeight: '800' },
  wins: { color: '#34d399', fontSize: 12, fontWeight: '800', textAlign: 'right' },
  points: { marginTop: 3, color: '#a78bfa', fontSize: 11, textAlign: 'right' },
});
