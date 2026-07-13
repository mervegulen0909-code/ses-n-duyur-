import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { isLocale, LOCALE_NAMES, LOCALES, setLocale, type Locale } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

/**
 * Language picker — mirrors the web's cookie-based switcher. Persists the
 * choice (AsyncStorage) and re-renders every `useTranslation()` consumer via
 * i18next's language-change event. RTL scripts (Arabic) need a full app
 * restart to fully re-flow native views, so we prompt for that explicitly.
 */
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = isLocale(i18n.language) ? i18n.language : 'en';

  async function choose(locale: Locale) {
    setOpen(false);
    const needsRestart = await setLocale(locale);
    const { data } = await supabase.auth.getSession();
    if (data.session?.user.id) {
      await supabase.from('profiles').update({ locale }).eq('id', data.session.user.id);
    }
    if (needsRestart) {
      Alert.alert(t('Language.restartTitle'), t('Language.restartBody'), [
        { text: t('Language.ok') },
      ]);
    }
  }

  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={8} style={styles.trigger}>
        <Text style={styles.triggerText}>{LOCALE_NAMES[current]}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            {LOCALES.map((l) => (
              <Pressable
                key={l}
                onPress={() => void choose(l)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                <Text style={[styles.rowText, l === current && styles.rowTextActive]}>
                  {LOCALE_NAMES[l]}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    borderWidth: 1,
    borderColor: '#404040',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  triggerText: { color: '#d4d4d8', fontSize: 13, fontWeight: '600' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#171717',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 8,
  },
  row: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 10 },
  rowPressed: { backgroundColor: '#262626' },
  rowText: { color: '#d4d4d8', fontSize: 16 },
  rowTextActive: { color: '#22D3EE', fontWeight: '700' },
});
