import { type ReactNode } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { layout, spacing } from '@/theme';
import { useTheme } from '@/providers/ThemeProvider';

interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  center?: boolean;
  contentStyle?: ViewStyle;
  backgroundColor?: string;
}

export function Screen({ children, scroll = true, center = false, contentStyle, backgroundColor }: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const bg = backgroundColor ?? colors.background;

  const isDesktop = width >= layout.desktopBreakpoint;
  const isTablet = !isDesktop && width >= layout.tabletBreakpoint;
  const maxWidth = isDesktop ? layout.maxContentWidthWide : layout.maxContentWidth;
  const paddingHorizontal = isDesktop ? spacing.xxl : isTablet ? spacing.xl : spacing.lg;

  const inner = (
    <View
      style={[
        styles.content,
        center && styles.center,
        {
          paddingHorizontal,
          paddingTop: insets.top + spacing.lg,
          paddingBottom: insets.bottom + spacing.xl,
        },
        contentStyle,
      ]}
    >
      <View style={[styles.constrained, { maxWidth }]}>{children}</View>
    </View>
  );

  if (!scroll) {
    return <View style={[styles.flex, { backgroundColor: bg }]}>{inner}</View>;
  }

  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: bg }]}
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
    alignItems: 'center',
  },
  center: {
    justifyContent: 'center',
  },
  constrained: {
    width: '100%',
  },
});
