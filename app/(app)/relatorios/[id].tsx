import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { Button } from '@/components/Button';
import {
  CommissionFields,
  commissionFromPercent,
  percentToNumber,
} from '@/components/CommissionFields';
import { DateField } from '@/components/DateField';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { db, type Sale, type SaleInput, type Simulation } from '@/data';
import { dateKey } from '@/features/agenda/dates';
import {
  buildFlow,
  computeFinancingSum,
  formatDateBR,
  formatMonthYearBR,
  monthsBetween,
} from '@/features/simulador/calc';
import { ensureCommissionForSale } from '@/features/comissao/link';
import { generateProposal } from '@/features/simulador/proposal';
import {
  ASSOCIATION_OPTIONS,
  EDIT_DRAFT_KEY,
  setPendingEditId,
  type SimuladorState,
} from '@/features/simulador/SimuladorProvider';
import { useFeatureAccess } from '@/features/useFeatureAccess';
import { currencyToNumber, formatCPF, formatCurrencyBRL, formatPhone } from '@/lib/masks';
import { sessionStorage } from '@/lib/storage';
import { useAuth } from '@/providers/AuthProvider';
import { useProfile } from '@/providers/ProfileProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { layout, radius, spacing, typography, type AppColors } from '@/theme';

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
function digits(v: string | null | undefined): string {
  return (v ?? '').replace(/\D/g, '');
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
/** Número → texto mascarado de moeda. Vazio quando não há valor. */
function toMasked(value: number | null): string {
  if (value == null || value <= 0) return '';
  return formatCurrencyBRL(String(Math.round(value * 100)));
}
/**
 * Campo de dinheiro da simulação → número, ou `null` quando o corretor nunca
 * preencheu. `null` e zero são coisas diferentes: zero seria um chute.
 */
function optionalMoney(masked: string): number | null {
  return masked.trim() ? currencyToNumber(masked) : null;
}

/**
 * Composição de valores da venda derivada da simulação.
 * `ownResourcesValue` é o que o cliente paga direto à construtora, ou seja o
 * fluxo montado no simulador (ato + mensais + semestrais + anuais) — a mesma
 * conta que o app já usa em `buildFlow`. Sem fluxo montado, vai `null`.
 */
function saleComposition(st: SimuladorState): {
  financedValue: number | null;
  subsidyValue: number | null;
  fgtsValue: number | null;
  ownResourcesValue: number | null;
} {
  const own = round2(buildFlow(st).distributed);
  return {
    financedValue: optionalMoney(st.financingApproved),
    subsidyValue: optionalMoney(st.subsidy),
    fgtsValue: optionalMoney(st.fgts),
    ownResourcesValue: own > 0 ? own : null,
  };
}

/**
 * O índice único `sales_simulation_unique` impede duas vendas para a mesma
 * simulação. O repositório já devolve uma frase em português nesse caso, mas o
 * teste cobre também o erro cru do Postgres: por nenhum caminho o corretor vê
 * "duplicate key value violates unique constraint".
 */
function isDuplicateSaleError(message: string): boolean {
  return /já (foi )?registrada|duplicate key|duplicada|unique|23505|already exists/i.test(message);
}

/**
 * Marca a simulação como convertida (`status = 'venda_realizada'`).
 *
 * É best-effort de propósito: a venda já está salva e é ela a fonte da verdade.
 * Se o sync falhar, a tela tenta de novo no próximo carregamento.
 */
async function syncSimulationSold(simulationId: string): Promise<void> {
  await db.simulations.setStatus(simulationId, 'venda_realizada');
}

export default function SimulationDetailScreen() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { profile } = useProfile();
  const { user } = useAuth();
  const { canUse } = useFeatureAccess();
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = user?.id ?? null;

  const [sim, setSim] = useState<Simulation | null>(null);
  const [sale, setSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [saleModal, setSaleModal] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [simulation, existing] = await Promise.all([
      db.simulations.get(id),
      db.sales.getBySimulation(id),
    ]);
    setSim(simulation);
    setSale(existing);
    setLoading(false);
    // Auto-correção: se a venda existe mas o status da simulação ficou para
    // trás (sync que falhou em outro momento), tenta de novo em silêncio.
    if (existing && simulation && simulation.status !== 'venda_realizada') {
      void syncSimulationSold(id);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function onEdit() {
    if (!sim) return;
    setNotice(null);
    setPendingEditId(sim.id);
    await sessionStorage.setItem(EDIT_DRAFT_KEY, JSON.stringify(sim.state));
    router.push({ pathname: '/(app)/simulador', params: { editId: sim.id } });
  }

  async function onGeneratePdf() {
    if (!sim) return;
    setNotice(null);
    setGenerating(true);
    try {
      // A foto da construtora sai no topo do PDF. A simulação guarda só o id da
      // empresa, então buscamos aqui. Em try/catch próprio: se a consulta
      // falhar, a proposta sai sem a foto — nunca deixa de sair.
      let companyPhotoUrl: string | null = null;
      try {
        if (userId && sim.companyId) {
          const companies = await db.companies.list(userId);
          companyPhotoUrl = companies.find((c) => c.id === sim.companyId)?.photoUrl ?? null;
        }
      } catch {
        companyPhotoUrl = null;
      }
      await generateProposal({
        sim: sim.state,
        profile,
        companyName: sim.companyName,
        developmentName: sim.developmentName,
        deliveryDate: sim.deliveryDate,
        gerente: sim.managerName,
        todayISO: sim.proposalDate ?? new Date().toISOString().slice(0, 10),
        companyPhotoUrl,
      });
    } finally {
      setGenerating(false);
    }
  }

  function openSale(saleId: string) {
    router.push({ pathname: '/(app)/vendas/[id]', params: { id: saleId } });
  }

  function onSaleDone() {
    setNotice(null);
    if (!canUse('vendas')) {
      router.push({ pathname: '/paywall', params: { upgrade: '1' } });
      return;
    }
    setSaleModal(true);
  }

  /** A venda foi criada: sincroniza a simulação e abre a tela da venda. */
  function onSaleCreated(created: Sale) {
    setSaleModal(false);
    setSale(created);
    setNotice(null);
    // A comissão nasce junto com a venda, com as parcelas já calculadas pela
    // regra da construtora. Adiantar aqui é só ganho de tempo: a tela da venda,
    // para onde o app navega em seguida, tenta de novo e MOSTRA o motivo se
    // falhar — o lançamento nunca fracassa em silêncio.
    if (userId) void ensureCommissionForSale(userId, created);
    // ORDEM: a venda já está gravada (o índice único do banco garante que não
    // existe outra para esta simulação). Só depois o status da simulação é
    // atualizado — e sem bloquear a navegação, porque é um espelho do que a
    // venda já diz. Se o sync falhar, nada é perdido nem duplicado.
    if (sim) {
      setSim({ ...sim, status: 'venda_realizada' });
      void syncSimulationSold(sim.id);
    }
    openSale(created.id);
  }

  /** O banco recusou por já existir venda para esta simulação. */
  async function onSaleDuplicate() {
    setSaleModal(false);
    setNotice('Esta simulação já tinha uma venda registrada.');
    await load();
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
        <Text style={styles.heroDev} numberOfLines={2}>
          {sim.developmentName?.trim() || '—'}
          {sim.companyName ? `  ·  ${sim.companyName}` : ''}
        </Text>
        <View style={styles.heroMonthly}>
          <Text style={styles.heroMonthlyLabel}>Parcela mensal</Text>
          <Text style={styles.heroMonthlyValue}>{brl(flow.monthlyValue)}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Button label="Editar" variant="secondary" onPress={onEdit} style={styles.actionBtn} />
        <Button
          label="Gerar PDF"
          onPress={onGeneratePdf}
          loading={generating}
          style={styles.actionBtn}
        />
      </View>
      {sale ? (
        <View style={styles.saleDone}>
          <View style={styles.saleDoneTop}>
            <Text style={styles.saleDoneTitle}>✓ Venda já registrada</Text>
            <Text style={styles.saleDoneValue}>{brl(sale.saleValue)}</Text>
          </View>
          <Text style={styles.saleDoneMeta}>
            Fechada em {formatDateBR(sale.saleDate)}
            {sale.status === 'distratada' ? '  ·  distratada' : ''}
          </Text>
          <Button
            label="Abrir venda"
            variant="secondary"
            onPress={() => openSale(sale.id)}
            style={styles.saleDoneBtn}
          />
        </View>
      ) : (
        <Button
          label={canUse('vendas') ? 'Registrar venda realizada' : 'Registrar venda (plano Pro)'}
          variant="secondary"
          onPress={onSaleDone}
        />
      )}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

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
        <Button label="Excluir simulação" variant="danger" onPress={onDelete} />
      </View>

      {saleModal ? (
        <RegistrarVendaModal
          sim={sim}
          userId={userId}
          onClose={() => setSaleModal(false)}
          onCreated={onSaleCreated}
          onDuplicate={() => void onSaleDuplicate()}
        />
      ) : null}
    </Screen>
  );
}

/* ------------------------------------------------------------------------- *
 * Registro da venda realizada
 * ------------------------------------------------------------------------- */

function RegistrarVendaModal({
  sim,
  userId,
  onClose,
  onCreated,
  onDuplicate,
}: {
  sim: Simulation;
  userId: string | null;
  onClose: () => void;
  onCreated: (sale: Sale) => void;
  onDuplicate: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const st = sim.state;

  // Tudo o que não se pergunta ao corretor sai daqui: já está na simulação.
  const prefill = useMemo(() => {
    const composition = saleComposition(st);
    const unitValue = sim.unitValue ?? currencyToNumber(st.unitValue);
    return {
      clientName: st.proponent1.name.trim() || (sim.clientName ?? '').trim(),
      clientCpf: digits(st.proponent1.cpf),
      clientPhone: digits(st.proponent1.contact),
      clientEmail: st.proponent1.email.trim(),
      block: st.block > 0 ? st.block : null,
      unit: st.unit.trim() || null,
      unitValue: unitValue > 0 ? unitValue : null,
      ...composition,
    };
  }, [sim, st]);

  const [saleDate, setSaleDate] = useState<string>(dateKey(new Date()));
  const [saleValue, setSaleValue] = useState<string>(toMasked(prefill.unitValue));
  const [percent, setPercent] = useState('');
  const [commission, setCommission] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saleValueNumber = currencyToNumber(saleValue);

  /**
   * Mudar o valor da venda mantém a % e recalcula a comissão em R$ — a % é a
   * regra do negócio, o valor é consequência dela.
   */
  function onChangeSaleValue(text: string) {
    const masked = formatCurrencyBRL(text);
    setSaleValue(masked);
    if (percent.trim()) setCommission(commissionFromPercent(currencyToNumber(masked), percent));
  }

  async function onSave() {
    setError(null);
    if (!userId) {
      setError('Sessão expirada. Entre novamente para registrar a venda.');
      return;
    }
    if (!prefill.clientName) {
      setError('A simulação está sem o nome do cliente. Edite a simulação antes de registrar.');
      return;
    }
    if (!saleDate) {
      setError('Informe a data da venda.');
      return;
    }
    if (saleValueNumber <= 0) {
      setError('Informe o valor da venda.');
      return;
    }

    const pctNumber = percent.trim() ? percentToNumber(percent) : null;
    const commissionNumber = commission.trim() ? currencyToNumber(commission) : null;

    const input: SaleInput = {
      simulationId: sim.id,
      // A simulação não guarda de qual lead veio: sem chute, vai `null`.
      leadId: null,
      clientName: prefill.clientName,
      clientCpf: prefill.clientCpf || null,
      clientPhone: prefill.clientPhone || null,
      clientEmail: prefill.clientEmail || null,
      companyId: sim.companyId,
      companyName: sim.companyName,
      developmentId: sim.developmentId,
      developmentName: sim.developmentName,
      block: prefill.block,
      unit: prefill.unit,
      saleValue: saleValueNumber,
      financedValue: prefill.financedValue,
      subsidyValue: prefill.subsidyValue,
      fgtsValue: prefill.fgtsValue,
      ownResourcesValue: prefill.ownResourcesValue,
      commissionPct: pctNumber,
      commissionValue: commissionNumber,
      saleDate,
      status: 'ativa',
      distratoDate: null,
      distratoReason: null,
      // Base do KPI de ciclo de venda: quando o atendimento começou.
      originStartedAt: sim.createdAt,
      notes: notes.trim() || null,
    };

    setSaving(true);
    const res = await db.sales.create(userId, input);
    setSaving(false);
    if (!res.ok) {
      if (isDuplicateSaleError(res.error)) {
        onDuplicate();
        return;
      }
      setError(res.error);
      return;
    }
    onCreated(res.data);
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Registrar venda realizada</Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Fechar">
              <Text style={styles.sheetClose}>✕</Text>
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Text style={styles.sheetHint}>
              Confira os dados da venda. Cliente, empreendimento e composição do pagamento vêm da
              simulação.
            </Text>

            <DateField label="Data da venda" value={saleDate} onChange={setSaleDate} />
            <Input
              label="Valor da venda"
              value={saleValue}
              onChangeText={onChangeSaleValue}
              placeholder="R$ 0,00"
              keyboardType="number-pad"
            />
            <CommissionFields
              saleValue={saleValueNumber}
              percent={percent}
              commission={commission}
              onChange={(next) => {
                setPercent(next.percent);
                setCommission(next.commission);
              }}
            />
            {/*
              Sem isso o corretor não tem como saber que preencher a comissão
              aqui SOBRESCREVE a regra que ele cadastrou na construtora — e
              acharia que a campanha promocional simplesmente não funcionou.
            */}
            <Text style={styles.commissionHint}>
              {commission.trim() || percent.trim()
                ? 'Este valor manda: a comissão será lançada exatamente assim, ignorando o percentual e as campanhas da construtora.'
                : 'Deixe em branco para o app aplicar sozinho a regra da construtora (percentual padrão, campanha vigente e o parcelamento cadastrado).'}
            </Text>
            <Input
              label="Observações"
              value={notes}
              onChangeText={setNotes}
              placeholder="Contrato, correspondente, prazos…"
              multiline
              numberOfLines={3}
              style={styles.textArea}
            />

            <Text style={styles.band}>Vai gravado com a venda</Text>
            <View style={styles.card}>
              <Row label="Cliente" value={prefill.clientName} />
              <Row label="CPF" value={prefill.clientCpf ? formatCPF(prefill.clientCpf) : '—'} />
              <Row
                label="Telefone"
                value={prefill.clientPhone ? formatPhone(prefill.clientPhone) : '—'}
              />
              <Row label="E-mail" value={prefill.clientEmail || '—'} />
              <Row label="Construtora" value={sim.companyName ?? '—'} />
              <Row label="Empreendimento" value={sim.developmentName ?? '—'} />
              <Row
                label="Bloco / Unidade"
                value={`${prefill.block ?? '—'} / ${prefill.unit ?? '—'}`}
              />
              <Row label="Financiamento" value={moneyOrDash(prefill.financedValue)} />
              <Row label="Subsídio" value={moneyOrDash(prefill.subsidyValue)} />
              <Row label="FGTS" value={moneyOrDash(prefill.fgtsValue)} />
              <Row label="Recursos próprios" value={moneyOrDash(prefill.ownResourcesValue)} last />
            </View>

            <Button label="Salvar venda" onPress={() => void onSave()} loading={saving} />
            <Button label="Cancelar" variant="ghost" onPress={onClose} style={styles.sheetCancel} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function moneyOrDash(value: number | null): string {
  return value == null ? 'Não informado' : brl(value);
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
    heroClient: { ...typography.title, color: colors.primary, flexShrink: 1 },
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
      paddingVertical: spacing.lg,
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
      paddingVertical: spacing.xs,
    },
    badgeNeutral: { backgroundColor: colors.surfaceAlt },
    badgeOk: { backgroundColor: colors.successSoft },
    badgeBad: { backgroundColor: colors.dangerSoft },
    badgeText: { ...typography.caption, fontWeight: '700' },
    badgeTextNeutral: { color: colors.inkMuted },
    badgeTextOk: { color: colors.success },
    badgeTextBad: { color: colors.danger },
    deleteWrap: { marginTop: spacing.xl, alignItems: 'center' },

    saleDone: {
      backgroundColor: colors.successSoft,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.success,
      padding: spacing.lg,
    },
    saleDoneTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    saleDoneTitle: { ...typography.label, color: colors.success, flexShrink: 1 },
    saleDoneValue: { ...typography.label, color: colors.success },
    saleDoneMeta: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
    saleDoneBtn: { marginTop: spacing.md },

    error: {
      ...typography.caption,
      color: colors.danger,
      backgroundColor: colors.dangerSoft,
      padding: spacing.md,
      borderRadius: radius.sm,
      marginBottom: spacing.md,
      overflow: 'hidden',
    },
    textArea: { minHeight: 88, paddingTop: spacing.md, textAlignVertical: 'top' },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
      alignItems: 'center',
    },
    sheet: {
      width: '100%',
      maxWidth: layout.maxContentWidth,
      maxHeight: '92%',
      backgroundColor: colors.background,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: spacing.xl,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      marginBottom: spacing.lg,
    },
    sheetTitle: { ...typography.heading, color: colors.ink, flex: 1 },
    sheetClose: { ...typography.heading, color: colors.inkMuted },
    sheetHint: { ...typography.caption, color: colors.inkMuted, marginBottom: spacing.lg },
    commissionHint: {
      ...typography.caption,
      color: colors.inkMuted,
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.sm,
      padding: spacing.md,
      marginTop: -spacing.sm,
      marginBottom: spacing.lg,
      overflow: 'hidden',
    },
    sheetCancel: { marginTop: spacing.sm },
  });
