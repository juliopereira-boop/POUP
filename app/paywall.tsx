import { useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Linking, Platform, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { InactiveAccountScreen } from '@/components/InactiveAccountScreen';
import { Logo } from '@/components/Logo';
import { Screen } from '@/components/Screen';
import { db } from '@/data';
import { PLANS, PLAN_ORDER, type PlanConfig } from '@/features/plans';
import { canShowBilling } from '@/features/store';
import { useAuth } from '@/providers/AuthProvider';
import { useSubscription } from '@/providers/SubscriptionProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';
import { useThemedStyles } from '@/providers/ThemeProvider';

export default function PaywallScreen() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { isActive, refresh, trialExpired, tier: currentTier } = useSubscription();
  const { pending, upgrade } = useLocalSearchParams<{ pending?: string; upgrade?: string }>();
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [checkingAgain, setCheckingAgain] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // `upgrade=1` deixa quem já tem assinatura ativa abrir a comparação de planos
  // (é para onde os módulos exclusivos do Pro mandam o usuário do Start).
  //
  // No app das lojas esse modo não existe: comparar planos ali é vender. E
  // desligá-lo aqui também conserta uma armadilha — sem isso, um assinante
  // ATIVO do Start que tocasse em "fazer upgrade" cairia na tela de
  // "assinatura não está ativa", que seria simplesmente falso. Com o modo
  // desligado, ele volta para o app, que é o certo.
  const upgradeMode = upgrade === '1' && canShowBilling;

  if (user && isActive && !upgradeMode) return <Redirect href="/(app)" />;
  if (!user) return <Redirect href="/(auth)/login" />;

  async function checkAgain() {
    setCheckingAgain(true);
    await refresh();
    setCheckingAgain(false);
  }

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

  // No app das lojas, nada de cobrança aparece — nem preço, nem link. Veja
  // `src/features/store.ts` e `InactiveAccountScreen`.
  if (!canShowBilling) {
    return (
      <InactiveAccountScreen
        onCheckAgain={() => void checkAgain()}
        checking={checkingAgain}
        onSignOut={() => void signOut()}
        trialExpired={trialExpired}
      />
    );
  }

  const subtitle = trialExpired
    ? 'Seu teste gratuito terminou'
    : upgradeMode
      ? 'Compare os planos e faça o upgrade'
      : 'Escolha seu plano';

  return (
    <Screen center>
      <View style={styles.header}>
        <Logo size={40} />
        <Text style={styles.subtitle}>{subtitle}</Text>
        <Text style={styles.headerHint}>
          Veja abaixo tudo o que está incluído em cada plano.
        </Text>
      </View>

      {trialExpired ? (
        <View style={styles.trialBanner}>
          <Text style={styles.trialText}>
            O período de teste gratuito desta conta acabou e o acesso ficou bloqueado. Escolha um
            plano abaixo para voltar a usar o POUP — seus dados continuam salvos.
          </Text>
        </View>
      ) : null}

      {pending === '1' ? (
        <View style={styles.pendingBanner}>
          <Text style={styles.pendingText}>
            Recebemos seu pagamento e estamos confirmando com o Stripe. Isso pode levar alguns
            instantes.
          </Text>
          <Button
            label="Verificar novamente"
            variant="secondary"
            onPress={checkAgain}
            loading={checkingAgain}
            style={styles.pendingButton}
          />
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.plans}>
        {PLAN_ORDER.map((tier) => {
          const plan = PLANS[tier];
          const isCurrent = upgradeMode && isActive && currentTier === plan.tier;
          return (
            <PlanCard
              key={plan.tier}
              plan={plan}
              isCurrent={isCurrent}
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

      {upgradeMode && isActive ? (
        <Button
          label="Voltar"
          variant="ghost"
          onPress={() => router.replace('/(app)')}
          style={styles.signout}
        />
      ) : (
        <Button label="Sair" variant="ghost" onPress={() => void signOut()} style={styles.signout} />
      )}
    </Screen>
  );
}

function PlanCard({
  plan,
  isCurrent,
  loading,
  disabled,
  onSubscribe,
}: {
  plan: PlanConfig;
  isCurrent: boolean;
  loading: boolean;
  disabled: boolean;
  onSubscribe: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const missing = plan.features.filter((f) => !f.included);

  return (
    <View style={[styles.card, plan.highlighted && styles.cardHighlighted]}>
      <View style={styles.cardHead}>
        <View style={styles.cardHeadMain}>
          <Text style={styles.planName}>{plan.name}</Text>
          <Text style={styles.planTagline}>{plan.tagline}</Text>
        </View>
        {plan.highlighted ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Recomendado</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.planPrice}>{plan.priceLabel}</Text>

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

      <Button
        label={isCurrent ? 'Seu plano atual' : 'Assinar'}
        variant={plan.highlighted ? 'primary' : 'secondary'}
        onPress={onSubscribe}
        loading={loading}
        disabled={isCurrent || (disabled && !loading)}
        style={styles.cta}
      />
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    header: { alignItems: 'center', marginBottom: spacing.xl },
    subtitle: {
      ...typography.heading,
      color: colors.ink,
      marginTop: spacing.md,
      textAlign: 'center',
    },
    headerHint: {
      ...typography.caption,
      color: colors.inkMuted,
      marginTop: spacing.xs,
      textAlign: 'center',
    },
    plans: { width: '100%', gap: spacing.lg },
    card: {
      width: '100%',
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
    },
    cardHighlighted: {
      borderColor: colors.primary,
      borderWidth: 2,
    },
    cardHead: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    cardHeadMain: { flex: 1 },
    badge: {
      backgroundColor: colors.primarySoft,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: 4,
    },
    badgeText: { ...typography.caption, fontSize: 11, color: colors.primary, fontWeight: '700' },
    planName: { ...typography.heading, color: colors.ink },
    planTagline: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
    planPrice: {
      ...typography.title,
      color: colors.primary,
      marginTop: spacing.sm,
      marginBottom: spacing.lg,
    },
    features: { gap: spacing.sm },
    feature: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    check: { color: colors.success, fontWeight: '700', fontSize: 13, lineHeight: 18 },
    cross: { color: colors.inkSubtle, fontWeight: '700', fontSize: 13, lineHeight: 18 },
    featureText: { ...typography.label, fontWeight: '400', color: colors.ink, flex: 1 },
    featureTextOff: {
      ...typography.label,
      fontWeight: '400',
      color: colors.inkSubtle,
      textDecorationLine: 'line-through',
      flex: 1,
    },
    missingNote: {
      ...typography.caption,
      color: colors.inkMuted,
      marginTop: spacing.md,
    },
    cta: { marginTop: spacing.lg },
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
    pendingBanner: {
      width: '100%',
      backgroundColor: colors.primarySoft,
      borderRadius: radius.lg,
      padding: spacing.lg,
      marginBottom: spacing.lg,
    },
    pendingText: {
      ...typography.body,
      color: colors.primaryDark,
      marginBottom: spacing.md,
    },
    pendingButton: { alignSelf: 'stretch' },
    trialBanner: {
      width: '100%',
      backgroundColor: colors.warningSoft,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.warning,
      padding: spacing.lg,
      marginBottom: spacing.lg,
    },
    trialText: { ...typography.body, color: colors.ink },
    signout: { marginTop: spacing.md },
  });
