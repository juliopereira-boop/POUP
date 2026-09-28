/**
 * O cartão de um plano: nome, preço, tudo o que está (e o que não está)
 * incluído e o botão. O mesmo cartão no paywall (conta sem acesso) e na tela
 * Planos (sempre disponível) — o texto do botão muda com a situação da conta.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import type { PlanConfig } from '@/features/plans';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

export function CartaoDePlano({
  plan,
  priceLabel,
  rotulo,
  atual,
  loading,
  disabled,
  onPress,
  perigo = false,
}: {
  plan: PlanConfig;
  priceLabel: string;
  /** Texto do botão ("Assinar o Pro", "Mudar para o Start"...). `null` = sem botão. */
  rotulo: string | null;
  /** É o plano em uso: o cartão ganha o selo e o botão fica desligado. */
  atual: boolean;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
  /** Botão discreto (ex.: descer de plano). */
  perigo?: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  const missing = plan.features.filter((f) => !f.included);

  return (
    <View style={[styles.card, (atual || plan.highlighted) && styles.cardHighlighted]}>
      <View style={styles.cardHead}>
        <View style={styles.cardHeadMain}>
          <Text style={styles.planName}>{plan.name}</Text>
          <Text style={styles.planTagline}>{plan.tagline}</Text>
        </View>
        {atual ? (
          <View style={[styles.badge, styles.badgeAtual]}>
            <Text style={[styles.badgeText, styles.badgeTextAtual]}>Seu plano</Text>
          </View>
        ) : plan.highlighted ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Recomendado</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.planPrice}>{priceLabel}</Text>

      <View style={styles.features}>
        {plan.features.map((f) => (
          <View key={f.key} style={styles.feature}>
            <Text style={f.included ? styles.check : styles.cross}>{f.included ? '✓' : '✕'}</Text>
            <Text style={f.included ? styles.featureText : styles.featureTextOff}>{f.label}</Text>
          </View>
        ))}
      </View>

      {missing.length > 0 ? (
        <Text style={styles.missingNote}>
          Não incluído no {plan.name}: {missing.map((f) => f.label).join(', ')}.
        </Text>
      ) : null}

      {rotulo ? (
        <Button
          label={rotulo}
          variant={atual || perigo ? 'secondary' : plan.highlighted ? 'primary' : 'secondary'}
          onPress={onPress}
          loading={loading}
          disabled={atual || (disabled && !loading)}
          style={styles.cta}
        />
      ) : null}
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    card: {
      width: '100%',
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
    },
    cardHighlighted: { borderColor: colors.primary, borderWidth: 2 },
    cardHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
    cardHeadMain: { flex: 1 },
    badge: { backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 4 },
    badgeAtual: { backgroundColor: colors.primary },
    badgeText: { ...typography.caption, fontSize: 11, color: colors.primary, fontWeight: '700' },
    badgeTextAtual: { color: colors.white },
    planName: { ...typography.heading, color: colors.ink },
    planTagline: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
    planPrice: { ...typography.title, color: colors.primary, marginTop: spacing.sm, marginBottom: spacing.lg },
    features: { gap: spacing.sm },
    feature: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    check: { color: colors.success, fontWeight: '700', fontSize: 13, lineHeight: 18 },
    cross: { color: colors.inkSubtle, fontWeight: '700', fontSize: 13, lineHeight: 18 },
    featureText: { ...typography.label, fontWeight: '400', color: colors.ink, flex: 1 },
    featureTextOff: { ...typography.label, fontWeight: '400', color: colors.inkSubtle, textDecorationLine: 'line-through', flex: 1 },
    missingNote: { ...typography.caption, color: colors.inkMuted, marginTop: spacing.md },
    cta: { marginTop: spacing.lg },
  });
