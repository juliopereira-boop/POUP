import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { spacing, typography, type AppColors } from '@/theme';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';
import { Logo } from './Logo';

interface LoadingScreenProps {
  /** Mensagem opcional exibida abaixo do spinner (ex.: "Confirmando pagamento..."). */
  message?: string;
}

/** Tela de carregamento em tela cheia (splash de sessão/assinatura). */
export function LoadingScreen({ message }: LoadingScreenProps = {}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.container}>
      <Logo size={40} />
      <ActivityIndicator color={colors.primary} style={styles.spinner} />
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
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
