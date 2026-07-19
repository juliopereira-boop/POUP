import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors } from '@/theme';
import { Logo } from './Logo';

/** Tela de carregamento em tela cheia (splash de sessão/assinatura). */
export function LoadingScreen() {
  return (
    <View style={styles.container}>
      <Logo size={40} />
      <ActivityIndicator color={colors.primary} style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    gap: 24,
  },
  spinner: { marginTop: 8 },
});
