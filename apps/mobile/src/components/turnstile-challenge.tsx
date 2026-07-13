import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useTranslation } from 'react-i18next';

import { WEB_BASE } from '@/lib/config';

export function TurnstileChallenge({
  visible,
  onToken,
  onCancel,
}: {
  visible: boolean;
  onToken: (token: string | null) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  function message(event: WebViewMessageEvent) {
    try {
      const payload = JSON.parse(event.nativeEvent.data) as { token?: string; disabled?: boolean };
      if (payload.token) onToken(payload.token);
      else if (payload.disabled) onToken(null);
    } catch {
      // Ignore messages not emitted by the bridge page.
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('Security.title')}</Text>
          <Pressable onPress={onCancel} hitSlop={10}>
            <Text style={styles.cancel}>{t('Security.cancel')}</Text>
          </Pressable>
        </View>
        <WebView
          source={{ uri: `${WEB_BASE}/mobile-turnstile` }}
          onMessage={message}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          originWhitelist={[WEB_BASE, 'https://challenges.cloudflare.com']}
          style={styles.webview}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', paddingTop: 52 },
  header: {
    minHeight: 52,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#262626',
  },
  title: { color: '#fafafa', fontSize: 16, fontWeight: '700' },
  cancel: { color: '#22D3EE', fontSize: 15, fontWeight: '600' },
  webview: { flex: 1, backgroundColor: '#0a0a0a' },
});
