import { useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { db } from '@/data';
import { useAuth } from '@/providers/AuthProvider';
import { useSubscription } from '@/providers/SubscriptionProvider';
import { colors, radius, spacing, typography } from '@/theme';

const STATUS_LABEL: Record<string, string> = {
  active: 'Ativa',
  trialing: 'Período de teste',
  past_due: 'Pagamento pendente',
  canceled: 'Cancelada',
  incomplete: 'Incompleta',
  none: 'Sem assinatura',
};

export default function ConfiguracoesScreen() {
  const { user, signOut } = useAuth();
  const { subscription } = useSubscription();
  const [loadingPortal, setLoadingPortal] = useState(false);

  async function openBillingPortal() {
    setLoadingPortal(true);
    const result = await db.billing.createBillingPortalSession();
    setLoadingPortal(false);
    if (result.ok) {
      if (Platform.OS === 'web') window.location.assign(result.data.url);
      else await Linking.openURL(result.data.url);
    }
  }

  const statusLabel = STATUS_LABEL[subscription?.status ?? 'none'] ?? 'Sem assinatura';

  return (
    <Screen>
      <Text style={styles.sectionLabel}>Conta</Text>
      <View style={styles.card}>
        <Row label="Nome" value={user?.displayName ?? '—'} />
        <Divider />
        <Row label="Email" value={user?.email ?? '—'} />
      </View>

      <Text style={styles.sectionLabel}>Assinatura</Text>
      <View style={styles.card}>
        <Row label="Status" value={statusLabel} />
        {subscription?.currentPeriodEnd ? (
          <>
            <Divider />
            <Row
              label="Renova em"
              value={new Date(subscription.currentPeriodEnd).toLocaleDateString('pt-BR')}
            />
          </>
        ) : null}
        <View style={styles.cardAction}>
          <Button
            label="Gerenciar assinatura"
            variant="secondary"
            onPress={openBillingPortal}
            loading={loadingPortal}
          />
        </View>
      </View>

      <View style={styles.signOut}>
        <Button label="Sair da conta" variant="danger" onPress={() => void signOut()} />
      </View>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  sectionLabel: {
    ...typography.label,
    color: colors.inkMuted,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.lg,
  },
  rowLabel: { ...typography.body, color: colors.inkMuted },
  rowValue: { ...typography.body, color: colors.ink, flexShrink: 1, textAlign: 'right' },
  divider: { height: 1, backgroundColor: colors.border },
  cardAction: { paddingVertical: spacing.lg },
  signOut: { marginTop: spacing.xxl },
});
