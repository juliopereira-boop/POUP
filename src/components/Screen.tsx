import { type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, layout, spacing } from '@/theme';

interface ScreenProps {
  children: ReactNode;
  /** Rola o conteúdo (padrão) ou fixa (para telas com layout próprio). */
  scroll?: boolean;
  /** Centraliza vertical e horizontalmente (útil para login/paywall). */
  center?: boolean;
  contentStyle?: ViewStyle;
  backgroundColor?: string;
}

/**
 * Container base de todas as telas.
 * - Respeita safe areas (notch/barras) no nativo.
 * - Limita a largura em telas grandes (PC/tablet) e centraliza — mobile-first
 *   que também fica confortável no desktop.
 */
export function Screen({
  children,
  scroll = true,
  center = false,
  contentStyle,
  backgroundColor = colors.background,
}: ScreenProps) {
  const insets = useSafeAreaInsets();

  const inner = (
    <View
      style={[
        styles.content,
        center && styles.center,
        { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl },
        contentStyle,
      ]}
    >
      <View style={styles.constrained}>{children}</View>
    </View>
  );

  if (!scroll) {
    return <View style={[styles.flex, { backgroundColor }]}>{inner}</View>;
  }

  return (
    <ScrollView
      style={[styles.flex, { backgroundColor }]}
      contentContainerStyle={[styles.scrollContent, center && styles.centerScroll]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {inner}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  centerScroll: { justifyContent: 'center' },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  center: {
    justifyContent: 'center',
  },
  constrained: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
  },
});
