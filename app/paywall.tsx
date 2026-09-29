import { useEffect, useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { AccountActions } from '@/components/AccountActions';
import { InactiveAccountScreen } from '@/components/InactiveAccountScreen';
import { LoadingScreen } from '@/components/Loading';
import { Logo } from '@/components/Logo';
import { Screen } from '@/components/Screen';
import { CartaoDePlano } from '@/components/planos/CartaoDePlano';
import { registrar } from '@/features/analytics/eventos';
import { abrirCheckout } from '@/features/cobranca/abrirCobranca';
import {
  loadStorePrices,
  purchaseStorePlan,
  restoreStorePurchases,
} from '@/features/cobranca/comprasNaLoja';
import { PLANS, PLAN_ORDER, type PlanConfig } from '@/features/plans';
import { canShowBilling, usesNativeBilling } from '@/features/store';
import { useAuth } from '@/providers/AuthProvider';
import { useSubscription } from '@/providers/SubscriptionProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';
import { useThemedStyles } from '@/providers/ThemeProvider';

export default function PaywallScreen() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { user, signOut, initializing } = useAuth();
  const { isActive, refresh, trialExpired, initialLoad } = useSubscription();
  const { pending, upgrade } = useLocalSearchParams<{ pending?: string; upgrade?: string }>();
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [checkingAgain, setCheckingAgain] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [storePrices, setStorePrices] = useState<Partial<Record<string, string>>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accountOptionsOpen, setAccountOptionsOpen] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);

  /*
   * ANTES DOS `Redirect` de propósito: hooks não podem ficar atrás de um
   * `return`. O `if` mora DENTRO do efeito porque esta tela também é o caminho
   * de passagem de quem já tem assinatura — e nesse caso ninguém olhou preço
   * nenhum, então não houve evento.
   */
  const veriaOsPlanos = Boolean(user) && !initialLoad && !isActive;
  useEffect(() => {
    if (veriaOsPlanos) {
      registrar('subscription_viewed', {
        etapa: trialExpired ? 'fim_do_teste' : 'sem_assinatura',
        resultado: 'ok',
      });
    }
  }, [veriaOsPlanos, trialExpired]);

  useEffect(() => {
    if (!usesNativeBilling || !veriaOsPlanos) return;
    let active = true;
    void loadStorePrices().then((result) => {
      if (!active) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStorePrices(Object.fromEntries(result.data.map((item) => [item.tier, item.priceLabel])));
    });
    return () => {
      active = false;
    };
  }, [veriaOsPlanos]);

  // O paywall é só para quem está SEM acesso. Quem tem acesso (teste, plano
  // pago, acesso concedido) compara, assina, troca e cancela na tela Planos,
  // dentro do app. `upgrade=1` é de links antigos: vai direto para lá.
  // Aberto direto pelo endereço (link antigo, volta do checkout), a sessão
  // ainda está carregando: sem esperar, mandaria quem está logado para o login.
  if (initializing || (user && initialLoad)) return <LoadingScreen />;
  if (user && isActive) return <Redirect href={upgrade === '1' ? '/(app)/planos' : '/(app)'} />;
  if (!user) return <Redirect href="/(auth)/login" />;

  async function checkAgain() {
    setCheckingAgain(true);
    try {
      await refresh();
    } finally {
      setCheckingAgain(false);
    }
  }

  async function subscribe(plan: PlanConfig) {
    setError(null);
    setNotice(null);
    setLoadingTier(plan.tier);
    try {
      if (usesNativeBilling) {
        const result = await purchaseStorePlan(plan.tier);
        if (!result.ok) {
          if (!result.cancelled) setError(result.error);
          return;
        }
        await refresh();
        setNotice('Compra confirmada. Seu acesso já foi atualizado.');
        return;
      }

      // Sem acesso, é sempre uma primeira compra (ou uma volta): checkout.
      const result = await abrirCheckout(plan.tier);
      if (!result.ok) setError(result.error);
    } catch {
      setError('Não foi possível abrir a cobrança. Tente novamente.');
    } finally {
      setLoadingTier(null);
    }
  }

  async function restorePurchases() {
    setError(null);
    setNotice(null);
    setRestoring(true);
    try {
      const result = await restoreStorePurchases();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (!result.data) {
        setNotice('Não encontramos compras anteriores nesta Conta Apple.');
        return;
      }
      await refresh();
      setNotice('Compras restauradas. Seu acesso foi atualizado.');
    } finally {
      setRestoring(false);
    }
  }

  // A web vende pelo Stripe e o app nativo vende exclusivamente pela loja.
  // Este fallback só permanece para uma eventual distribuição sem cobrança.
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

  const subtitle = trialExpired ? 'Seu teste gratuito terminou' : 'Escolha seu plano';

  return (
    <Screen center>
      <View style={styles.header}>
        <Logo size={40} />
        <Text style={styles.subtitle}>{subtitle}</Text>
        <Text style={styles.headerHint}>Veja abaixo tudo o que está incluído em cada plano.</Text>
      </View>

      {trialExpired ? (
        <View style={styles.trialBanner}>
          <Text style={styles.trialText}>
            O período de teste gratuito desta conta acabou e o acesso ficou bloqueado. Escolha um
            plano abaixo para voltar a usar o POUP. Seus dados continuam salvos.
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
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <View style={styles.plans}>
        {PLAN_ORDER.map((tier) => {
          const plan = PLANS[tier];
          return (
            <CartaoDePlano
              key={plan.tier}
              plan={plan}
              priceLabel={
                usesNativeBilling
                  ? storePrices[plan.tier]
                    ? `${storePrices[plan.tier]}/mês`
                    : 'Preço indisponível'
                  : plan.priceLabel
              }
              rotulo={`Assinar o ${plan.name}`}
              atual={false}
              loading={loadingTier === plan.tier}
              disabled={
                loadingTier !== null || (usesNativeBilling && storePrices[plan.tier] === undefined)
              }
              onPress={() => subscribe(plan)}
            />
          );
        })}
      </View>

      <Text style={styles.fineprint}>
        {usesNativeBilling
          ? 'Assinatura mensal com renovação automática. O pagamento será cobrado na conta da loja do seu dispositivo. A renovação pode ser cancelada nos ajustes da loja até 24 horas antes do fim do período atual.'
          : 'Cobrança mensal recorrente. Gerencie ou cancele sua assinatura pelo portal de cobrança.'}
      </Text>
      {usesNativeBilling ? (
        <Button
          label="Restaurar compras"
          variant="secondary"
          onPress={() => void restorePurchases()}
          loading={restoring}
        />
      ) : null}
      <View style={styles.footerActions}>
        <View style={styles.legalActions}>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/termos' as Href)}
            style={({ pressed }) => [styles.footerLink, pressed && styles.footerLinkPressed]}
          >
            <Text style={styles.footerLinkText}>Termos de Uso</Text>
          </Pressable>
          <Text style={styles.footerSeparator}>•</Text>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/privacidade')}
            style={({ pressed }) => [styles.footerLink, pressed && styles.footerLinkPressed]}
          >
            <Text style={styles.footerLinkText}>Política de Privacidade</Text>
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: accountOptionsOpen }}
          onPress={() => setAccountOptionsOpen((open) => !open)}
          style={({ pressed }) => [styles.accountToggle, pressed && styles.footerLinkPressed]}
        >
          <Text style={styles.accountToggleText}>Ajuda e configurações</Text>
          <Text style={styles.accountToggleIcon}>{accountOptionsOpen ? '⌃' : '⌄'}</Text>
        </Pressable>

        {accountOptionsOpen ? (
          <View style={styles.accountOptions}>
            <AccountActions includePrivacy={false} />
          </View>
        ) : null}
      </View>

      <Button
        label="Sair"
        variant="ghost"
        onPress={() => setConfirmingSignOut(true)}
        style={styles.signout}
      />

      <Modal
        visible={confirmingSignOut}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmingSignOut(false)}
      >
        <View style={styles.signOutBackdrop}>
          <View style={styles.signOutDialog} accessibilityRole="alert">
            <Text style={styles.signOutTitle}>Sair da conta?</Text>
            <Text style={styles.signOutDescription}>
              Você precisará entrar novamente para acessar o POUP neste dispositivo.
            </Text>
            <Button label="Sim, sair" variant="danger" onPress={() => void signOut()} />
            <Button
              label="Continuar conectado"
              variant="secondary"
              onPress={() => setConfirmingSignOut(false)}
            />
          </View>
        </View>
      </Modal>
    </Screen>
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
    notice: {
      ...typography.caption,
      color: colors.ink,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      borderRadius: radius.md,
      marginBottom: spacing.lg,
      overflow: 'hidden',
    },
    footerActions: {
      width: '100%',
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    legalActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      alignItems: 'center',
      gap: spacing.sm,
    },
    footerLink: { paddingVertical: spacing.sm },
    footerLinkPressed: { opacity: 0.6 },
    footerLinkText: { ...typography.caption, color: colors.primary, fontWeight: '600' },
    footerSeparator: { ...typography.caption, color: colors.inkSubtle },
    accountToggle: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    accountToggleText: { ...typography.label, color: colors.inkMuted },
    accountToggleIcon: { ...typography.body, color: colors.inkMuted },
    accountOptions: {
      marginTop: spacing.xs,
      paddingHorizontal: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
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
    signOutBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    signOutDialog: {
      width: '100%',
      maxWidth: 440,
      gap: spacing.md,
      padding: spacing.xl,
      borderRadius: radius.xl,
      backgroundColor: colors.surface,
    },
    signOutTitle: { ...typography.heading, color: colors.ink },
    signOutDescription: { ...typography.body, color: colors.inkMuted, marginBottom: spacing.sm },
  });
