import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Select } from '@/components/Select';
import { db, type Correspondent } from '@/data';
import { useSimulador } from '@/features/simulador/SimuladorProvider';
import { formatCNPJ, formatPhone } from '@/lib/masks';
import { useAuth } from '@/providers/AuthProvider';
import { useProfile } from '@/providers/ProfileProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

export default function SimuladorCorretor() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { user } = useAuth();
  const { profile } = useProfile();
  const sim = useSimulador();

  const [correspondents, setCorrespondents] = useState<Correspondent[]>([]);
  const [managerName, setManagerName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    // Correspondentes da empresa selecionada.
    if (sim.companyId) {
      setCorrespondents(await db.companies.listCorrespondents(sim.companyId));
    }
    // Gerente responsável vem do cadastro do empreendimento.
    if (sim.developmentId) {
      const devs = await db.developments.list(user.id);
      setManagerName(devs.find((d) => d.id === sim.developmentId)?.managerName ?? null);
    }
  }, [user, sim.companyId, sim.developmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  function selectCorrespondent(id: string) {
    sim.setField('correspondentId', id);
    sim.setField('correspondentName', correspondents.find((c) => c.id === id)?.name ?? null);
  }

  function advance() {
    setError(null);
    if (correspondents.length > 0 && !sim.correspondentId) {
      return setError('Selecione o correspondente.');
    }
    router.push('/(app)/simulador/cliente');
  }

  return (
    <Screen>
      <Text style={styles.step}>Etapa 2 de 5</Text>
      <Text style={styles.title}>Dados do corretor</Text>
      <Text style={styles.hint}>
        Nome, imobiliária, telefone e CNPJ vêm do seu perfil (toque em Editar para alterar).
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.card}>
        <Field label="Nome" value={profile?.fullName} />
        <Divider />
        <Field label="Imobiliária" value={profile?.agency} />
        <Divider />
        <Field label="Telefone" value={profile?.phone ? formatPhone(profile.phone) : null} />
        <Divider />
        <Field label="CNPJ" value={profile?.cnpj ? formatCNPJ(profile.cnpj) : null} />
        <Divider />
        <Field label="Gerente imob" value={profile?.agencyManager} />
      </View>

      <Button
        label="Editar dados do perfil"
        variant="secondary"
        onPress={() => router.push('/(app)/perfil')}
        style={styles.editBtn}
      />

      <Text style={styles.sectionLabel}>Dados do negócio</Text>
      <View style={styles.card}>
        {/* Gerente responsável — do cadastro do empreendimento (não editável aqui) */}
        <Field label="Gerente" value={managerName} />
      </View>

      <Select
        label="Correspondente"
        placeholder="Selecione o correspondente"
        value={sim.correspondentId}
        options={correspondents.map((c) => ({ value: c.id, label: c.name }))}
        onChange={selectCorrespondent}
        emptyHint="Nenhum correspondente cadastrado para esta empresa."
      />

      <Button label="Avançar" onPress={advance} />
    </Screen>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value?.trim() ? value : '—'}</Text>
    </View>
  );
}

function Divider() {
  const styles = useThemedStyles(makeStyles);
  return <View style={styles.divider} />;
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    step: { ...typography.caption, color: colors.primary, fontWeight: '700' },
    title: { ...typography.title, color: colors.ink, marginBottom: spacing.xs },
    hint: { ...typography.body, color: colors.inkMuted, marginBottom: spacing.xl },
    sectionLabel: {
      ...typography.label,
      color: colors.inkMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: spacing.sm,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.lg,
    },
    field: { paddingVertical: spacing.lg },
    fieldLabel: { ...typography.caption, color: colors.inkMuted, marginBottom: 2 },
    fieldValue: { ...typography.body, color: colors.ink },
    divider: { height: 1, backgroundColor: colors.border },
    editBtn: { marginBottom: spacing.lg },
    error: {
      ...typography.caption,
      color: colors.danger,
      backgroundColor: colors.dangerSoft,
      padding: spacing.md,
      borderRadius: 8,
      marginBottom: spacing.lg,
      overflow: 'hidden',
    },
  });
