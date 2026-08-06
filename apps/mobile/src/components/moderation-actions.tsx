import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { reportContent, setBlocked } from '@/lib/api';

/**
 * Report / block controls for user-generated content.
 *
 * App Store Review Guideline 1.2 requires apps with user-generated content to
 * ship a way to report offensive content AND to block abusive users, inside the
 * app. VoxScore had both on the website only, which does not satisfy it.
 *
 * The reason is collected in a Modal rather than Alert.prompt: Alert.prompt is
 * iOS-only, so on Android the report button would silently do nothing — the
 * exact failure a reviewer would hit.
 *
 * `handle` is optional because a comment can come from a deleted/anonymous
 * profile — reporting still works there, blocking does not, so the block action
 * simply is not drawn.
 */
export function ModerationActions({
  targetType,
  targetId,
  handle,
}: {
  targetType: 'performance' | 'comment' | 'profile';
  targetId: string;
  handle?: string | null;
}) {
  const { t } = useTranslation();
  const [reported, setReported] = useState(false);
  const [blocked, setBlockedState] = useState(false);
  const [busy, setBusy] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [reason, setReason] = useState('');

  // The server schema requires 3..1000 characters; mirror it here so the user
  // is stopped by a disabled button instead of a 422.
  const reasonValid = reason.trim().length >= 3;

  async function submitReport() {
    if (busy || !reasonValid) return;
    setBusy(true);
    const res = await reportContent(targetType, targetId, reason.trim());
    setBusy(false);
    setPromptOpen(false);
    setReason('');
    if (res.ok) setReported(true);
    else Alert.alert(t('Moderation.reportFailed'), res.error ?? '');
  }

  async function toggleBlock(next: boolean) {
    if (!handle) return;
    setBusy(true);
    const res = await setBlocked(handle.replace(/^@/, ''), next);
    setBusy(false);
    if (res.ok) setBlockedState(next);
    else Alert.alert(t('Moderation.blockFailed'), res.error ?? '');
  }

  function onBlockPress() {
    if (busy || !handle) return;
    // Blocking severs follows both ways, so confirm first. Unblocking is
    // harmless and goes straight through.
    if (blocked) {
      void toggleBlock(false);
      return;
    }
    Alert.alert(t('Moderation.blockTitle'), t('Moderation.blockConfirm', { handle }), [
      { text: t('Common.cancel'), style: 'cancel' },
      { text: t('Moderation.block'), style: 'destructive', onPress: () => void toggleBlock(true) },
    ]);
  }

  return (
    <View style={styles.row}>
      {reported ? (
        <Text style={styles.done}>{t('Moderation.reported')}</Text>
      ) : (
        <Pressable onPress={() => setPromptOpen(true)} disabled={busy} hitSlop={8}>
          <Text style={styles.action}>{t('Moderation.report')}</Text>
        </Pressable>
      )}

      {!!handle && (
        <Pressable onPress={onBlockPress} disabled={busy} hitSlop={8}>
          <Text style={styles.action}>
            {blocked ? t('Moderation.unblock') : t('Moderation.block')}
          </Text>
        </Pressable>
      )}

      <Modal
        visible={promptOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPromptOpen(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.title}>{t('Moderation.reportTitle')}</Text>
            <Text style={styles.hint}>{t('Moderation.reportPrompt')}</Text>
            <TextInput
              style={styles.input}
              value={reason}
              onChangeText={setReason}
              multiline
              maxLength={1000}
              autoFocus
              placeholderTextColor="#6b7280"
              placeholder={t('Moderation.reportPlaceholder')}
            />
            <View style={styles.sheetActions}>
              <Pressable
                onPress={() => {
                  setPromptOpen(false);
                  setReason('');
                }}
                hitSlop={8}
              >
                <Text style={styles.cancel}>{t('Common.cancel')}</Text>
              </Pressable>
              <Pressable onPress={() => void submitReport()} disabled={!reasonValid || busy}>
                <Text style={[styles.submit, (!reasonValid || busy) && styles.submitDisabled]}>
                  {t('Moderation.send')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 16, marginTop: 6 },
  action: { color: '#6b7280', fontSize: 12 },
  done: { color: '#34D399', fontSize: 12 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  sheet: { backgroundColor: '#171717', borderRadius: 16, padding: 20, gap: 10 },
  title: { color: '#fafafa', fontSize: 17, fontWeight: '700' },
  hint: { color: '#9ca3af', fontSize: 13 },
  input: {
    backgroundColor: '#0a0a0a',
    borderRadius: 10,
    padding: 12,
    color: '#fafafa',
    fontSize: 15,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 20, marginTop: 4 },
  cancel: { color: '#9ca3af', fontSize: 15, fontWeight: '600' },
  submit: { color: '#22D3EE', fontSize: 15, fontWeight: '700' },
  submitDisabled: { opacity: 0.4 },
});
