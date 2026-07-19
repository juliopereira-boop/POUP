import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/theme';
import { Logo } from './Logo';

interface LoadingScreenProps {
  /** Mensagem opcional exibida abaixo do spinner (ex.: "Confirmando pagamento..."). */
  message?: string;
}

/** Tela de carregamento em tela cheia (splash de sessão/assinatura). */
export function LoadingScreen({ message }: LoadingScreenProps = {}) {
  return (
    <View style={styles.container}>
      <Logo size={40} />
      <ActivityIndicator color={colors.primary} style={styles.spinner} />
      {message ? <Text style={styles.message}>{message}</Text> : null}
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
    paddingHorizontal: spacing.xl,
  },
  spinner: { marginTop: 8 },
  message: {
    ...typography.body,
    color: colors.inkMuted,
    textAlign: 'center',
  },
});
