import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from './Button';
import { Screen } from './Screen';
import { PLANS, PLAN_FEATURES } from '@/features/plans';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

interface ProFeatureLockProps {
  emoji: string;
  title: string;
  description: string;
}

const PRO_ONLY_LABELS = PLAN_FEATURES.filter(
  (f) => !f.includedIn.includes('start') && f.includedIn.includes('pro'),
).map((f) => f.label);

/** Estado exibido quando a assinatura atual não dá acesso ao módulo. */
export function ProFeatureLock({ emoji, title, description }: ProFeatureLockProps) {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();

  return (
    <Screen center>
      <View style={styles.card}>
        <Text style={styles.emoji}>{emoji}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>PLANO PRO</Text>
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
        <Text style={styles.notice}>
          Este módulo está disponível no plano Pro ({PLANS.pro.priceLabel}). Seu plano atual é o
          Start.
        </Text>

        <View style={styles.list}>
          {PRO_ONLY_LABELS.map((label) => (
            <View key={label} style={styles.row}>
              <Text style={styles.check}>✓</Text>
              <Text style={styles.rowText}>{label}</Text>
            </View>
          ))}
          <View style={styles.row}>
            <Text style={styles.check}>✓</Text>
            <Text style={styles.rowText}>{PLANS.pro.storageLabel} de armazenamento</Text>
          </View>
        </View>

        <Button
          label="Assinar o plano Pro"
          onPress={() => router.push({ pathname: '/paywall', params: { upgrade: '1' } })}
          style={styles.cta}
        />
      </View>
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.xl,
      alignItems: 'center',
    },
    emoji: { fontSize: 48, marginBottom: spacing.md },
    badge: {
      backgroundColor: colors.primarySoft,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: 4,
      marginBottom: spacing.md,
    },
    badgeText: {
      ...typography.caption,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1,
      color: colors.primary,
    },
    title: { ...typography.title, color: colors.ink, textAlign: 'center' },
    description: {
      ...typography.body,
      color: colors.inkMuted,
      textAlign: 'center',
      marginTop: spacing.sm,
    },
    notice: {
      ...typography.caption,
      color: colors.inkMuted,
      textAlign: 'center',
      marginTop: spacing.md,
    },
    list: {
      alignSelf: 'stretch',
      gap: spacing.sm,
      marginTop: spacing.lg,
      marginBottom: spacing.xl,
    },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    check: { color: colors.success, fontWeight: '700', fontSize: 14, lineHeight: 18 },
    rowText: { ...typography.label, fontWeight: '400', color: colors.ink, flex: 1 },
    cta: { alignSelf: 'stretch' },
  });
