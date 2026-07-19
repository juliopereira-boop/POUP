import { useState } from 'react';
import { Redirect } from 'expo-router';
import { Alert, Linking, Platform, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Logo } from '@/components/Logo';
import { Screen } from '@/components/Screen';
import { db } from '@/data';
import { env } from '@/lib/env';
import { useAuth } from '@/providers/AuthProvider';
import { useSubscription } from '@/providers/SubscriptionProvider';
import { colors, radius, spacing, typography } from '@/theme';

const BENEFITS = [
  'Simulador de poupança para seus clientes',
  'Controle de comissões e vendas',
  'Relatórios de desempenho',
  'Material de venda sempre à mão',
  'Acesso no celular e no computador',
];

export default function PaywallScreen() {
  const { user, signOut } = useAuth();
  const { isActive } = useSubscription();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Já é assinante? Não faz sentido ver o paywall.
  if (user && isActive) return <Redirect href="/(app)" />;
  if (!user) return <Redirect href="/(auth)/login" />;

  async function subscribe() {
    setError(null);
    if (!env.stripePriceId) {
      setError('Plano não configurado. Defina EXPO_PUBLIC_STRIPE_PRICE_ID.');
      return;
    }
    setLoading(true);
    const result = await db.billing.createCheckoutSession(env.stripePriceId);
    setLoading(false);
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
      </View>

      <View style={styles.card}>
        <Text style={styles.plan}>Plano POUP Pro</Text>
        <Text style={styles.title}>Tudo o que você precisa para vender mais</Text>

        {BENEFITS.map((b) => (
          <View key={b} style={styles.benefit}>
            <Text style={styles.check}>✓</Text>
            <Text style={styles.benefitText}>{b}</Text>
          </View>
        ))}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          label="Assinar agora"
          onPress={subscribe}
          loading={loading}
          style={styles.cta}
        />
        <Text style={styles.fineprint}>
          Cobrança mensal recorrente. Cancele quando quiser nas configurações.
        </Text>
      </View>

      <Button label="Sair" variant="ghost" onPress={() => void signOut()} style={styles.signout} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', marginBottom: spacing.xl },
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  plan: { ...typography.label, color: colors.primary, marginBottom: spacing.xs },
  title: { ...typography.title, color: colors.ink, marginBottom: spacing.lg },
  benefit: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md, gap: spacing.md },
  check: {
    color: colors.success,
    fontWeight: '700',
    fontSize: 16,
  },
  benefitText: { ...typography.body, color: colors.ink, flex: 1 },
  cta: { marginTop: spacing.lg },
  fineprint: {
    ...typography.caption,
    color: colors.inkSubtle,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    padding: spacing.md,
    borderRadius: 8,
    marginTop: spacing.md,
    overflow: 'hidden',
  },
  signout: { marginTop: spacing.lg },
});
