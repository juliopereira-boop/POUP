import { useCallback, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { db, type Simulation } from '@/data';
import {
  buildFlow,
  computeFinancingSum,
  formatDateBR,
  formatMonthYearBR,
  monthsBetween,
} from '@/features/simulador/calc';
import { generateProposal } from '@/features/simulador/proposal';
import { ASSOCIATION_OPTIONS, EDIT_DRAFT_KEY } from '@/features/simulador/SimuladorProvider';
import { currencyToNumber } from '@/lib/masks';
import { sessionStorage } from '@/lib/storage';
import { useProfile } from '@/providers/ProfileProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function money(masked: string): string {
  return brl(currencyToNumber(masked));
}
function pct(n: number | null): string {
  return `${(n ?? 0).toFixed(1).replace('.', ',')}%`;
}
function associationLabel(v: string | null): string {
  return ASSOCIATION_OPTIONS.find((o) => o.value === v)?.label ?? '—';
}

export default function SimulationDetailScreen() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { profile } = useProfile();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [sim, setSim] = useState<Simulation | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setSim(await db.simulations.get(id));
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function onEdit() {
    if (!sim) return;
    // Abre o simulador em MODO EDIÇÃO: o estado vai para uma chave de rascunho
    // separada, então não afeta a simulação nova iniciada pelo menu.
    await sessionStorage.setItem(EDIT_DRAFT_KEY, JSON.stringify(sim.state));
    router.push({ pathname: '/(app)/simulador', params: { editId: sim.id } });
  }

  async function onGeneratePdf() {
    if (!sim) return;
    setGenerating(true);
    try {
      await generateProposal({
        sim: sim.state,
        profile,
        companyName: sim.companyName,
        developmentName: sim.developmentName,
        deliveryDate: sim.deliveryDate,
        gerente: sim.managerName,
        // Reusa a data original da proposta para manter o PDF consistente.
        todayISO: sim.proposalDate ?? new Date().toISOString().slice(0, 10),
      });
    } finally {
      setGenerating(false);
    }
  }

  function onSaleDone() {
    setNotice('Registro de "Venda realizada" chega em breve.');
  }

  function onDelete() {
    if (!sim) return;
    const doDelete = async () => {
      const result = await db.simulations.remove(sim.id);
      if (result.ok) router.back();
    };
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (window.confirm('Excluir esta simulação dos relatórios?')) void doDelete();
    } else {
      Alert.alert('Excluir simulação', 'Excluir esta simulação dos relatórios?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Excluir', style: 'destructive', onPress: () => void doDelete() },
      ]);
    }
  }

  if (loading) {
    return (
      <Screen>
        <Text style={styles.muted}>Carregando...</Text>
      </Screen>
    );
  }

  if (!sim) {
    return (
      <Screen>
        <Text style={styles.muted}>Simulação não encontrada.</Text>
        <Button label="Voltar" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  const st = sim.state;
  const flow = buildFlow(st);
  const financingSum = computeFinancingSum(st);
  const neutral = sim.withinRisk == null;
  const mesesEntrega = monthsBetween(
    sim.proposalDate ?? new Date().toISOString().slice(0, 10),
    sim.deliveryDate,
  );
  const mesesLabel =
    mesesEntrega == null
      ? '—'
      : mesesEntrega <= 0
        ? 'Entregue'
        : `${mesesEntrega} ${mesesEntrega === 1 ? 'mês' : 'meses'}`;

  return (
    <Screen>
      <Stack.Screen options={{ title: sim.clientName?.trim() || 'Simulação' }} />

      {/* Resumo em destaque */}
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <Text style={styles.heroClient} numberOfLines={2}>
            {sim.clientName?.trim() || 'Cliente não informado'}
          </Text>
          <View
            style={[
              styles.badge,
              neutral ? styles.badgeNeutral : sim.withinRisk ? styles.badgeOk : styles.badgeBad,
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                neutral
                  ? styles.badgeTextNeutral
                  : sim.withinRisk
                    ? styles.badgeTextOk
                    : styles.badgeTextBad,
              ]}
            >
              {neutral ? pct(sim.riskPct) : `${sim.withinRisk ? '✓ Dentro' : '⚠ Acima'} · ${pct(sim.riskPct)}`}
            </Text>
          </View>
        </View>
        <Text style={styles.heroDev}>
          {sim.developmentName?.trim() || '—'}
          {sim.companyName ? `  ·  ${sim.companyName}` : ''}
        </Text>
        <View style={styles.heroMonthly}>
          <Text style={styles.heroMonthlyLabel}>Parcela mensal</Text>
          <Text style={styles.heroMonthlyValue}>{brl(flow.monthlyValue)}</Text>
        </View>
      </View>

      {/* Ações */}
      <View style={styles.actions}>
        <Button label="Editar" variant="secondary" onPress={onEdit} style={styles.actionBtn} />
        <Button
          label="Gerar PDF"
          onPress={onGeneratePdf}
          loading={generating}
          style={styles.actionBtn}
        />
      </View>
      <Button label="Venda realizada" variant="secondary" onPress={onSaleDone} />
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      {/* Cliente */}
      <SectionBand label={st.hasSecondProponent ? '1º Proponente' : 'Cliente'} />
      <View style={styles.card}>
        <Row label="Nome" value={st.proponent1.name} />
        <Row label="CPF" value={st.proponent1.cpf} />
        <Row label="Renda bruta" value={money(st.proponent1.rendaBruta)} />
        <Row label="E-mail" value={st.proponent1.email} />
        <Row label="Contato" value={st.proponent1.contact} last />
      </View>

      {st.hasSecondProponent ? (
        <>
          <SectionBand label="2º Proponente" />
          <View style={styles.card}>
            <Row label="Associação" value={associationLabel(st.association)} />
            <Row label="Nome" value={st.proponent2.name} />
            <Row label="CPF" value={st.proponent2.cpf} />
            <Row label="Renda bruta" value={money(st.proponent2.rendaBruta)} />
            <Row label="E-mail" value={st.proponent2.email} />
            <Row label="Contato" value={st.proponent2.contact} last />
          </View>
        </>
      ) : null}

      {/* Empreendimento */}
      <SectionBand label="Empreendimento" />
      <View style={styles.card}>
        <Row label="Empresa" value={sim.companyName ?? '—'} />
        <Row label="Empreendimento" value={sim.developmentName ?? '—'} />
        <Row label="Bloco / Quadra" value={String(st.block)} />
        <Row label="Unidade" value={st.unit} />
        <Row label="Valor da unidade" value={money(st.unitValue)} />
        <Row label="Entrega" value={formatMonthYearBR(sim.deliveryDate)} />
        <Row label="Meses p/ entrega" value={mesesLabel} />
        <Row label="Gerente" value={sim.managerName ?? '—'} />
        <Row label="Correspondente" value={st.correspondentName ?? '—'} last />
      </View>

      {/* Financiamento */}
      <SectionBand label="Financiamento" />
      <View style={styles.card}>
        <Row label="Financiamento aprovado" value={money(st.financingApproved)} />
        <Row label="Subsídio" value={money(st.subsidy)} />
        <Row label="FGTS" value={money(st.fgts)} />
        <Row
          label="Cupom"
          value={
            st.couponType === 'R$'
              ? money(st.couponValue)
              : st.couponType === '%'
                ? `${st.couponValue || '0'}%`
                : 'Sem cupom'
          }
        />
        <Row label="Taxa CEF" value={st.cefClientPays ? 'Cliente paga' : 'Não paga'} />
        {st.cefClientPays ? (
          <Row label="Parcela CEF" value={money(st.cefParcela)} last />
        ) : null}
      </View>

      {/* Fluxo de pagamento */}
      <SectionBand label="Fluxo de pagamento" />
      <View style={styles.card}>
        <Row label="Poupança" value={brl(flow.poupanca)} />
        <Row label="Financiamento total" value={brl(financingSum)} />
        <Row
          label="Ato"
          value={`${brl(flow.ato)}  ·  venc. ${formatDateBR(st.atoDueDate)}`}
        />
        <Row
          label="Mensais"
          value={`${flow.mensaisCount}× ${brl(flow.monthlyValue)}`}
        />
        {flow.semestralCount > 0 ? (
          <Row
            label="Semestrais"
            value={`${flow.semestralCount}× ${brl(flow.semestralValue)}`}
          />
        ) : null}
        {flow.anualCount > 0 ? (
          <Row label="Anuais" value={`${flow.anualCount}× ${brl(flow.anualValue)}`} />
        ) : null}
        <Row label="Saldo a distribuir" value={brl(flow.saldo)} last />
      </View>

      <View style={styles.deleteWrap}>
        <Button label="Excluir simulação" variant="ghost" onPress={onDelete} />
      </View>
    </Screen>
  );
}

function SectionBand({ label }: { label: string }) {
  const styles = useThemedStyles(makeStyles);
  return <Text style={styles.band}>{label}</Text>;
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={2}>
        {value?.trim() ? value : '—'}
      </Text>
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    muted: { ...typography.body, color: colors.inkSubtle, marginBottom: spacing.lg },
    hero: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginBottom: spacing.lg,
    },
    heroTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    heroClient: { ...typography.title, color: colors.ink, flexShrink: 1 },
    heroDev: { ...typography.body, color: colors.inkMuted, marginTop: 2 },
    heroMonthly: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: spacing.lg,
      paddingTop: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    heroMonthlyLabel: { ...typography.body, color: colors.inkMuted },
    heroMonthlyValue: { ...typography.title, color: colors.primary },
    actions: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
    actionBtn: { flex: 1 },
    notice: {
      ...typography.caption,
      color: colors.inkMuted,
      backgroundColor: colors.surfaceAlt,
      padding: spacing.md,
      borderRadius: radius.sm,
      marginTop: spacing.md,
      overflow: 'hidden',
    },
    band: {
      ...typography.label,
      color: colors.inkMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
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
      gap: spacing.lg,
      paddingVertical: spacing.md,
    },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
    rowLabel: { ...typography.body, color: colors.inkMuted, flexShrink: 0 },
    rowValue: {
      ...typography.body,
      color: colors.ink,
      fontWeight: '600',
      flexShrink: 1,
      textAlign: 'right',
    },
    badge: {
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: 4,
    },
    badgeNeutral: { backgroundColor: colors.surfaceAlt },
    badgeOk: { backgroundColor: colors.successSoft },
    badgeBad: { backgroundColor: colors.dangerSoft },
    badgeText: { ...typography.caption, fontWeight: '700' },
    badgeTextNeutral: { color: colors.inkMuted },
    badgeTextOk: { color: colors.success },
    badgeTextBad: { color: colors.danger },
    deleteWrap: { marginTop: spacing.xl, alignItems: 'center' },
  });
