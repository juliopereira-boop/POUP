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
  { key: 'ranking', label: 'Ranking', icon: 'trophy', route: '/(app)/ranking', match: '/ranking' },
  { key: 'mais', label: 'Mais', icon: 'menu', route: '/(app)/configuracoes', match: '/configuracoes' },
];

/**
 * Troca de aba com dois cuidados, os dois vindos do teste no iPhone (idas e
 * voltas rápidas):
 *   - tocar na aba em que você JÁ está, na tela principal dela, não faz nada
 *     (antes recriava a tela no meio de uma transição);
 *   - dois toques de aba em menos de 400 ms contam como um só — trocar de
 *     tela enquanto a anterior ainda está animando é o que deixa a pilha de
 *     navegação num estado estranho.
 */
const INTERVALO_ENTRE_ABAS_MS = 400;
let ultimaTroca = 0;

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

  function naRaizDaAba(tab: TabItem): boolean {
    if (tab.match === '/') return pathname === '/' || pathname === '/(app)';
    return pathname === tab.match;
  }

  function trocarPara(tab: TabItem) {
    if (naRaizDaAba(tab)) return;
    const agora = Date.now();
    if (agora - ultimaTroca < INTERVALO_ENTRE_ABAS_MS) return;
    ultimaTroca = agora;
    router.replace(tab.route);
  }

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      <View style={styles.inner}>
        {TABS.map((tab) => {
          const active = isActive(tab);
          return (
            <Pressable
              key={tab.key}
              onPress={() => trocarPara(tab)}
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
      paddingHorizontal: spacing.sm,
    },
    // Cinco abas: 58 de largura mínima cabe num celular de 320 px.
    item: { alignItems: 'center', justifyContent: 'center', minWidth: 58, gap: 3 },
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
