import { StyleSheet, Text, View } from 'react-native';

import { Screen } from './Screen';
import { radius, spacing, typography, type AppColors } from '@/theme';
import { useThemedStyles } from '@/providers/ThemeProvider';

interface FeaturePlaceholderProps {
  emoji: string;
  title: string;
  description: string;
}

/**
 * Tela padrão para funcionalidades ainda não construídas.
 * Cada feature do menu será desenvolvida uma a uma, substituindo este
 * placeholder pela implementação real.
 */
export function FeaturePlaceholder({ emoji, title, description }: FeaturePlaceholderProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Screen center>
      <View style={styles.card}>
        <Text style={styles.emoji}>{emoji}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Em desenvolvimento</Text>
        </View>
      </View>
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.xxl,
      alignItems: 'center',
    },
    emoji: { fontSize: 56, marginBottom: spacing.lg },
    title: { ...typography.title, color: colors.ink, textAlign: 'center', marginBottom: spacing.sm },
    description: {
      ...typography.body,
      color: colors.inkMuted,
      textAlign: 'center',
      marginBottom: spacing.xl,
    },
    badge: {
      backgroundColor: colors.warningSoft,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    badgeText: { ...typography.label, color: colors.warning },
  });
