/**
 * O CASCO DO SIMULADOR: o resultado parado no topo, os campos rolando embaixo.
 *
 * O `Screen` do resto do app rola a página inteira, e o resultado subiria junto
 * com o primeiro campo — justamente quando o corretor começa a digitar e quer
 * ver a parcela mudar. Aqui o topo não rola. Mesmas larguras do `Screen`, para
 * o simulador não parecer de outro aplicativo no computador.
 */
import { type ReactNode } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/providers/ThemeProvider';
import { layout, spacing } from '@/theme';

interface Props {
  topo: ReactNode;
  children: ReactNode;
}

export function CascoSimulador({ topo, children }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const isDesktop = width >= layout.desktopBreakpoint;
  const isTablet = !isDesktop && width >= layout.tabletBreakpoint;
  const paddingHorizontal = isDesktop ? spacing.xxl : isTablet ? spacing.xl : spacing.lg;
  const largura = { width: '100%' as const, maxWidth: layout.maxContentWidth, alignSelf: 'center' as const };

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.topo,
          { paddingHorizontal, backgroundColor: colors.background, borderBottomColor: colors.border },
        ]}
      >
        <View style={largura}>{topo}</View>
      </View>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={{
          paddingHorizontal,
          paddingTop: spacing.lg,
          // Folga extra no fim: o botão flutuante da LIA fica no canto de baixo e
          // cobriria o "Gerar proposta" se a lista acabasse rente à borda.
          paddingBottom: insets.bottom + spacing.xxl + 72,
        }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        <View style={largura}>{children}</View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topo: {
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
