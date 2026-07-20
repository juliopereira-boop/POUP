import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { db } from '@/data';
import { formatBytes } from '@/features/plans';
import { useAuth } from '@/providers/AuthProvider';
import { useSubscription } from '@/providers/SubscriptionProvider';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors, type ColorScheme } from '@/theme';

const STATUS_LABEL: Record<string, string> = {
  active: 'Ativa',
  trialing: 'Período de teste',
  past_due: 'Pagamento pendente',
  canceled: 'Cancelada',
  incomplete: 'Incompleta',
  none: 'Sem assinatura',
};

export default function ConfiguracoesScreen() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { user, signOut } = useAuth();
  const { subscription, plan } = useSubscription();
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [usedBytes, setUsedBytes] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    db.billing.getStorageUsedBytes(user.id).then((bytes) => {
      if (mounted) setUsedBytes(bytes);
    });
    return () => {
      mounted = false;
    };
  }, [user]);

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
  const limitBytes = subscription?.storageLimitBytes ?? plan?.storageLimitBytes ?? 0;
  const usagePct = limitBytes > 0 && usedBytes != null ? Math.min(1, usedBytes / limitBytes) : 0;

  return (
    <Screen>
      <Text style={styles.sectionLabel}>Conta</Text>
      <View style={styles.card}>
        <Row label="Nome" value={user?.displayName ?? '—'} />
        <Divider />
        <Row label="Email" value={user?.email ?? '—'} />
      </View>

      <Text style={styles.sectionLabel}>Aparência</Text>
      <View style={styles.card}>
        <View style={styles.themeRow}>
          <Text style={styles.rowLabel}>Tema</Text>
          <ThemeToggle />
        </View>
      </View>

      <Text style={styles.sectionLabel}>Cadastros</Text>
      <View style={styles.card}>
        <NavRow label="Empresas e empreendimentos" onPress={() => router.push('/(app)/cadastros')} />
      </View>

      <Text style={styles.sectionLabel}>Assinatura</Text>
      <View style={styles.card}>
        <Row label="Plano" value={plan?.name ?? '—'} />
        <Divider />
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

      <Text style={styles.sectionLabel}>Armazenamento</Text>
      <View style={styles.card}>
        <View style={styles.storageRow}>
          <Text style={styles.rowLabel}>Uso</Text>
          <Text style={styles.rowValue}>
            {usedBytes == null ? '—' : formatBytes(usedBytes)}
            {limitBytes > 0 ? ` de ${formatBytes(limitBytes)}` : ''}
          </Text>
        </View>
        {limitBytes > 0 ? (
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.round(usagePct * 100)}%` },
                usagePct >= 0.9 && { backgroundColor: colors.danger },
              ]}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.signOut}>
        <Button label="Sair da conta" variant="danger" onPress={() => void signOut()} />
      </View>
    </Screen>
  );
}

function ThemeToggle() {
  const styles = useThemedStyles(makeStyles);
  const { scheme, setScheme } = useTheme();
  const options: { key: ColorScheme; label: string }[] = [
    { key: 'light', label: '☀️ Claro' },
    { key: 'dark', label: '🌙 Escuro' },
  ];
  return (
    <View style={styles.segment}>
      {options.map((opt) => {
        const active = scheme === opt.key;
        return (
          <Pressable
            key={opt.key}
            onPress={() => setScheme(opt.key)}
            style={[styles.segmentItem, active && styles.segmentItemActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function NavRow({ label, onPress }: { label: string; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.navRow, pressed && styles.navRowPressed]}
      accessibilityRole="button"
    >
      <Text style={styles.rowValue}>{label}</Text>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function Divider() {
  const styles = useThemedStyles(makeStyles);
  return <View style={styles.divider} />;
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
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
    navRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.lg,
    },
    navRowPressed: { opacity: 0.6 },
    chevron: { ...typography.title, color: colors.inkSubtle },
    themeRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.lg,
      gap: spacing.lg,
    },
    segment: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.md,
      padding: 3,
    },
    segmentItem: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.sm,
    },
    segmentItemActive: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    segmentText: { ...typography.label, color: colors.inkMuted },
    segmentTextActive: { color: colors.ink },
    storageRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
      gap: spacing.lg,
    },
    progressTrack: {
      height: 8,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceAlt,
      marginBottom: spacing.lg,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: radius.pill,
      backgroundColor: colors.primary,
    },
    signOut: { marginTop: spacing.xxl },
  });
