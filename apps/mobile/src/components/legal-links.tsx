import { openBrowserAsync } from 'expo-web-browser';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LEGAL_LINKS } from '@/lib/links';

/**
 * In-app legal links (Terms / Privacy / DMCA), opened in the in-app browser.
 * Surfaced on the profile screen for BOTH signed-in and signed-out users so a
 * store reviewer can always reach the privacy policy. Uses `openBrowserAsync`
 * directly — the same primitive `external-link.tsx` wraps — which avoids the
 * typed-route `Href` constraint for external URLs.
 */
export function LegalLinks() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Legal</Text>
      {LEGAL_LINKS.map((link) => (
        <Pressable
          key={link.url}
          accessibilityRole="link"
          accessibilityHint={`Opens ${link.label} in the browser`}
          hitSlop={8}
          onPress={() => void openBrowserAsync(link.url)}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        >
          <Text style={styles.link}>{link.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 28, gap: 4 },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  row: { paddingVertical: 10 },
  rowPressed: { opacity: 0.6 },
  link: { fontSize: 15, color: '#22D3EE', fontWeight: '600' },
});
