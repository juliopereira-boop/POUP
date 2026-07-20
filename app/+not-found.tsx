import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { spacing, typography, type AppColors } from '@/theme';
import { useThemedStyles } from '@/providers/ThemeProvider';

export default function NotFound() {
  const styles = useThemedStyles(makeStyles);
  return (
    <>
      <Stack.Screen options={{ title: 'Página não encontrada' }} />
      <View style={styles.container}>
        <Text style={styles.emoji}>🧭</Text>
        <Text style={styles.title}>Página não encontrada</Text>
        <Link href="/">
          <Text style={styles.link}>Voltar ao início</Text>
        </Link>
      </View>
    </>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.xl,
    gap: spacing.md,
  },
  emoji: { fontSize: 48 },
  title: { ...typography.title, color: colors.ink },
  link: { ...typography.label, color: colors.primary, marginTop: spacing.md },
});
