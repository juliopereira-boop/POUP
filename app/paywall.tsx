import { useState } from 'react';
import { Redirect } from 'expo-router';
import { Alert, Linking, Platform, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Logo } from '@/components/Logo';
import { Screen } from '@/components/Screen';
import { db } from '@/data';
import { PLANS, PLAN_ORDER, type PlanConfig } from '@/features/plans';
import { useAuth } from '@/providers/AuthProvider';
import { useSubscription } from '@/providers/SubscriptionProvider';
import { colors, radius, spacing, typography } from '@/theme';

export default function PaywallScreen() {
  const { user, signOut } = useAuth();
  const { isActive } = useSubscription();
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Já é assinante? Não faz sentido ver o paywall.
  if (user && isActive) return <Redirect href="/(app)" />;
  if (!user) return <Redirect href="/(auth)/login" />;

  async function subscribe(plan: PlanConfig) {
    setError(null);
    if (!plan.stripePriceId) {
      setError(
        `Plano ${plan.name} não configurado. Defina EXPO_PUBLIC_STRIPE_PRICE_${plan.tier.toUpperCase()}.`,
      );
      return;
    }
    setLoadingTier(plan.tier);
    const result = await db.billing.createCheckoutSession(plan.stripePriceId);
    setLoadingTier(null);
    if (!result.ok) {
      if (Platform.OS === 'web') setError(result.error);
      else Alert.alert('POUP', result.error);
      return;
    }
    if (Platform.OS === 'web') window.location.assign(result.data.url);
    else await Linking.openURL(result.data.url);
  }

  return (
    <Screen center>
      <View style={styles.header}>
        <Logo size={40} />
        <Text style={styles.subtitle}>Escolha seu plano</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.plans}>
        {PLAN_ORDER.map((tier) => {
          const plan = PLANS[tier];
          return (
            <PlanCard
              key={plan.tier}
              plan={plan}
              loading={loadingTier === plan.tier}
              disabled={loadingTier !== null}
              onSubscribe={() => subscribe(plan)}
            />
          );
        })}
      </View>

      <Text style={styles.fineprint}>
        Cobrança mensal recorrente. Cancele quando quiser nas configurações.
      </Text>

      <Button label="Sair" variant="ghost" onPress={() => void signOut()} style={styles.signout} />
    </Screen>
  );
}

function PlanCard({
  plan,
  loading,
  disabled,
  onSubscribe,
}: {
  plan: PlanConfig;
  loading: boolean;
  disabled: boolean;
  onSubscribe: () => void;
}) {
  return (
    <View style={[styles.card, plan.highlighted && styles.cardHighlighted]}>
      {plan.highlighted ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Recomendado</Text>
        </View>
      ) : null}

      <Text style={styles.planName}>{plan.name}</Text>
      <Text style={styles.planPrice}>{plan.priceLabel}</Text>

      <View style={styles.benefits}>
        {plan.benefits.map((b) => (
          <View key={b} style={styles.benefit}>
            <Text style={styles.check}>✓</Text>
            <Text style={styles.benefitText}>{b}</Text>
          </View>
        ))}
      </View>

      <Button
        label="Assinar"
        variant={plan.highlighted ? 'primary' : 'secondary'}
        onPress={onSubscribe}
        loading={loading}
        disabled={disabled && !loading}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', marginBottom: spacing.xl },
  subtitle: { ...typography.body, color: colors.inkMuted, marginTop: spacing.md },
  plans: { width: '100%', gap: spacing.lg },
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  cardHighlighted: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  badge: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  badgeText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  planName: { ...typography.heading, color: colors.ink },
  planPrice: { ...typography.title, color: colors.ink, marginBottom: spacing.lg },
  benefits: { marginBottom: spacing.lg, gap: spacing.sm },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  check: { color: colors.success, fontWeight: '700', fontSize: 16 },
  benefitText: { ...typography.body, color: colors.ink, flex: 1 },
  fineprint: {
    ...typography.caption,
    color: colors.inkSubtle,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    padding: spacing.md,
    borderRadius: 8,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  signout: { marginTop: spacing.md },
});
