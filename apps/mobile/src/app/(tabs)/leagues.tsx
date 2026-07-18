import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  createCustomLeague,
  joinCustomLeague,
  myCustomLeagues,
  type CustomLeagueSummary,
} from '@/lib/api';
import { isValidLeagueName } from '@/lib/form-validation';
import { useSession } from '@/lib/use-session';

export default function CustomLeaguesScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { user, loading: authLoading } = useSession();
  const [items, setItems] = useState<CustomLeagueSummary[]>([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const result = await myCustomLeagues();
    setItems(result.leagues);
    setError(result.ok ? '' : t('Leagues.error'));
    setLoading(false);
  }, [t, user]);
  useFocusEffect(
    useCallback(() => {
      if (user) void load();
    }, [load, user]),
  );

  async function create() {
    if (!isValidLeagueName(name)) return setError(t('Leagues.nameTooShort'));
    setBusy(true);
    setError('');
    const result = await createCustomLeague(name.trim());
    setBusy(false);
    if (!result.ok) return setError(t('Leagues.error'));
    setName('');
    await load();
  }
  async function join() {
    const normalized = code.trim().toUpperCase();
    if (!/^[A-Z2-9]{8}$/.test(normalized)) return setError(t('Leagues.invalidCode'));
    setBusy(true);
    setError('');
    const result = await joinCustomLeague(normalized);
    setBusy(false);
    if (!result.ok) return setError(t('Leagues.joinFailed'));
    setCode('');
    await load();
  }

  if (authLoading) return <View style={styles.safe} />;
  if (!user) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.title}>{t('Leagues.title')}</Text>
          <Text style={styles.sub}>{t('Leagues.signInBody')}</Text>
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
        <Text style={styles.eyebrow}>VOXSCORE CREWS</Text>
        <Text style={styles.title}>{t('Leagues.title')}</Text>
      </View>
      {loading ? (
        <ActivityIndicator color="#22d3ee" style={styles.spinner} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>{t('Leagues.empty')}</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() =>
                router.push({
                  pathname: '/custom-league/[id]',
                  params: { id: item.id },
                } as unknown as Href)
              }
            >
              <View style={styles.rowMain}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.role}>
                  {(item.isOwner ? t('Leagues.owner') : t('Leagues.member')).toLocaleUpperCase(
                    i18n.language,
                  )}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          )}
          ListFooterComponent={
            <View style={styles.forms}>
              <Text style={styles.formTitle}>{t('Leagues.create')}</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={t('Leagues.name')}
                placeholderTextColor="#737373"
                style={styles.input}
                maxLength={40}
                editable={!busy}
              />
              <Pressable style={styles.primary} onPress={() => void create()} disabled={busy}>
                <Text style={styles.primaryText}>{t('Leagues.create')}</Text>
              </Pressable>
              <Text style={[styles.formTitle, { marginTop: 28 }]}>{t('Leagues.join')}</Text>
              <TextInput
                value={code}
                onChangeText={(value) => setCode(value.toUpperCase())}
                placeholder={t('Leagues.code')}
                placeholderTextColor="#737373"
                style={styles.input}
                maxLength={8}
                autoCapitalize="characters"
                editable={!busy}
              />
              <Pressable style={styles.secondary} onPress={() => void join()} disabled={busy}>
                <Text style={styles.secondaryText}>{t('Leagues.join')}</Text>
              </Pressable>
              {!!error && <Text style={styles.error}>{error}</Text>}
            </View>
          }
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
  sub: {
    marginTop: 10,
    marginBottom: 8,
    color: '#9ca3af',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  spinner: { marginTop: 40 },
  list: { paddingHorizontal: 16, paddingBottom: 40, gap: 8 },
  empty: { color: '#9ca3af', marginVertical: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#262626',
    padding: 16,
  },
  rowMain: { flex: 1 },
  name: { color: '#fafafa', fontSize: 16, fontWeight: '800' },
  // Uppercasing happens in JS with the active i18n locale; RN textTransform
  // uses the device locale, which turns English "i" into Turkish "İ".
  role: {
    marginTop: 4,
    color: '#737373',
    fontSize: 11,
    fontWeight: '700',
  },
  chevron: { color: '#22d3ee', fontSize: 28 },
  forms: { marginTop: 22, borderTopWidth: 1, borderTopColor: '#262626', paddingTop: 22 },
  formTitle: { color: '#fafafa', fontSize: 16, fontWeight: '800' },
  input: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#404040',
    color: '#fafafa',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  primary: {
    marginTop: 10,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#22d3ee',
    padding: 12,
  },
  primaryText: { color: '#083344', fontWeight: '900' },
  secondary: {
    marginTop: 10,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#22d3ee',
    padding: 12,
  },
  secondaryText: { color: '#67e8f9', fontWeight: '900' },
  error: { marginTop: 12, color: '#fb7185' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
