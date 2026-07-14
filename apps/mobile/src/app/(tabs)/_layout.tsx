import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, FONTS } from '@/constants/brand';

/**
 * Minimal structural type for the subset of the React Navigation tab-bar props
 * we use — avoids depending on `@react-navigation/bottom-tabs` being a direct
 * dependency (it's only transitive via expo-router).
 */
type TabBarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: {
    emit: (event: { type: 'tabPress'; target: string; canPreventDefault: true }) => {
      defaultPrevented: boolean;
    };
    navigate: (name: string) => void;
  };
};

/** Icon + label per tab route, keyed by file name. */
const TAB_META: Record<
  string,
  { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap; label: string }
> = {
  index: { on: 'home', off: 'home-outline', label: 'Tabs.home' },
  battle: { on: 'git-compare', off: 'git-compare-outline', label: 'Tabs.battle' },
  leagues: { on: 'people', off: 'people-outline', label: 'Tabs.leagues' },
  profile: { on: 'person', off: 'person-outline', label: 'Tabs.profile' },
};

function TabButton({
  routeKey,
  focused,
  onPress,
}: {
  routeKey: string;
  focused: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const meta = TAB_META[routeKey];
  if (!meta) return null;
  const color = focused ? COLORS.cyan : COLORS.faint;
  return (
    <Pressable
      onPress={onPress}
      style={styles.tabBtn}
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={t(meta.label)}
    >
      <Ionicons name={focused ? meta.on : meta.off} size={23} color={color} />
      <Text style={[styles.tabLabel, { color }]}>{t(meta.label)}</Text>
    </Pressable>
  );
}

/** Premium bottom bar: 2 tabs · elevated Add action · 2 tabs. */
function TabBar({ state, navigation }: TabBarProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const routes = state.routes;
  const onPress = (routeName: string, key: string, isFocused: boolean) => {
    const event = navigation.emit({ type: 'tabPress', target: key, canPreventDefault: true });
    if (!isFocused && !event.defaultPrevented) navigation.navigate(routeName);
  };

  const renderTab = (index: number) => {
    const route = routes[index];
    if (!route) return null;
    return (
      <TabButton
        key={route.key}
        routeKey={route.name}
        focused={state.index === index}
        onPress={() => onPress(route.name, route.key, state.index === index)}
      />
    );
  };

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {renderTab(0)}
      {renderTab(1)}

      <View style={styles.addSlot}>
        <Pressable
          onPress={() => router.push('/add')}
          style={({ pressed }) => [styles.addBtn, pressed && { transform: [{ scale: 0.94 }] }]}
          accessibilityRole="button"
          accessibilityLabel={t('Tabs.add')}
        >
          <Ionicons name="add" size={30} color={COLORS.onCyan} />
        </Pressable>
        <Text style={styles.addLabel}>{t('Tabs.add')}</Text>
      </View>

      {renderTab(2)}
      {renderTab(3)}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="battle" />
      <Tabs.Screen name="leagues" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-around',
    backgroundColor: COLORS.pageBg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 10,
    paddingHorizontal: 8,
  },
  tabBtn: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 2 },
  tabLabel: { fontFamily: FONTS.sansSemibold, fontSize: 10.5 },
  addSlot: { width: 72, alignItems: 'center', gap: 3 },
  addBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    marginTop: -22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.cyan,
    borderWidth: 4,
    borderColor: COLORS.surface,
    shadowColor: COLORS.cyan,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  addLabel: { fontFamily: FONTS.sansSemibold, fontSize: 10.5, color: COLORS.cyan, marginTop: -4 },
});
