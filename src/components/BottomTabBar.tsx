import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from './Icon';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';
import { layout, radius, spacing, typography, type AppColors } from '@/theme';

interface TabItem {
  key: string;
  label: string;
  icon: IconName;
  route: Href;
  match: string;
}

const TABS: TabItem[] = [
  { key: 'inicio', label: 'Início', icon: 'home', route: '/(app)', match: '/' },
  { key: 'agenda', label: 'Agenda', icon: 'calendar', route: '/(app)/calendario', match: '/calendario' },
  { key: 'leads', label: 'Leads', icon: 'contacts', route: '/(app)/leads', match: '/leads' },
  { key: 'mais', label: 'Mais', icon: 'menu', route: '/(app)/configuracoes', match: '/configuracoes' },
];

export function BottomTabBar() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  function isActive(tab: TabItem): boolean {
    if (tab.match === '/') return pathname === '/' || pathname === '/(app)';
    return pathname.startsWith(tab.match);
  }

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      <View style={styles.inner}>
        {TABS.map((tab) => {
          const active = isActive(tab);
          return (
            <Pressable
              key={tab.key}
              onPress={() => router.replace(tab.route)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={tab.label}
              style={styles.item}
            >
              <View style={[styles.iconBox, active && styles.iconBoxActive]}>
                <Icon
                  name={tab.icon}
                  size={22}
                  color={active ? colors.white : colors.inkMuted}
                  strokeWidth={active ? 1.9 : 1.7}
                />
              </View>
              {!active ? <Text style={styles.label}>{tab.label}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    wrap: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
      paddingTop: spacing.sm,
      alignItems: 'center',
    },
    inner: {
      width: '100%',
      maxWidth: layout.maxContentWidth,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      paddingHorizontal: spacing.lg,
    },
    item: { alignItems: 'center', justifyContent: 'center', minWidth: 64, gap: 3 },
    iconBox: {
      width: 46,
      height: 42,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconBoxActive: { backgroundColor: colors.navy },
    label: { ...typography.caption, color: colors.inkMuted, fontSize: 11.5 },
  });
