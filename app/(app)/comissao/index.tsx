import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { BarChart } from '@/components/charts/BarChart';
import { abbreviateBRL } from '@/components/charts/format';
import { RankingBars } from '@/components/charts/RankingBars';
import { Button } from '@/components/Button';
import { DateField } from '@/components/DateField';
import { Input } from '@/components/Input';
import { InstallmentStatusPill } from '@/components/InstallmentStatusPill';
import { ProFeatureLock } from '@/components/ProFeatureLock';
import { Screen } from '@/components/Screen';
import { Select } from '@/components/Select';
import { ToggleField } from '@/components/ToggleField';
import {
  db,
  EMPTY_COMMISSION_FILTERS,
  isInstallmentLate,
  type CommissionDateBasis,
  type CommissionFilters,
  type CommissionInstallment,
  type CommissionInstallmentStatus,
  type CommissionPeriodPreset,
  type CommissionWithInstallments,
  type Company,
} from '@/data';
import { dateKey } from '@/features/agenda/dates';
import { computeCommissionKpis, type CommissionKpis } from '@/features/comissao/kpis';
import { COMMISSION_PRESETS, resolveCommissionPeriod } from '@/features/comissao/period';
import { FEATURES } from '@/features/registry';
import { useFeatureAccess } from '@/features/useFeatureAccess';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';
import { layout, radius, spacing, typography, type AppColors } from '@/theme';

const feature = FEATURES.find((f) => f.key === 'comissao')!;

type Tab = 'painel' | 'parcelas';
type Styles = ReturnType<typeof makeStyles>;

const BASIS_OPTIONS: { value: CommissionDateBasis; label: string }[] = [
  { value: 'vencimento', label: 'Vencimento da parcela' },
  { value: 'venda', label: 'Data da venda' },
  { value: 'recebimento', label: 'Data do recebimento' },
];

/** Rótulo curto da base, para caber no resumo do filtro e no painel. */
const BASIS_SHORT: Record<CommissionDateBasis, string> = {
  vencimento: 'vencimento',
  venda: 'venda',
  recebimento: 'recebimento',
};

const STATUS_OPTIONS: { value: CommissionInstallmentStatus | 'todas'; label: string }[] = [
  { value: 'todas', label: 'Todas as parcelas' },
  { value: 'pendente', label: 'Somente pendentes' },
  { value: 'recebida', label: 'Somente recebidas' },
  { value: 'cancelada', label: 'Somente canceladas' },
];

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function pct(n: number | null): string {
  if (n === null) return '—';
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

/** YYYY-MM-DD lido por partes locais — `new Date(ymd)` cairia no dia anterior. */
function dateBR(ymd: string | null): string {
  if (!ymd) return '—';
  const [y, m, d] = ymd.split('-');
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

function ymdToLocalDate(ymd: string): Date | null {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** Dias entre hoje e `ymd` (negativo = já passou), sempre em partes locais. */
function daysFromToday(ymd: string): number | null {
  const target = ymdToLocalDate(ymd);
  if (!target) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** "hoje" / "em 5 dias" / "atrasada há 12 dias" para o próximo vencimento. */
function prazoLabel(ymd: string): string {
  const dias = daysFromToday(ymd);
  if (dias === null) return '';
  if (dias === 0) return 'vence hoje';
  if (dias === 1) return 'vence amanhã';
  if (dias > 1) return `vence em ${dias} dias`;
  const atraso = Math.abs(dias);
  return `atrasada há ${atraso} ${atraso === 1 ? 'dia' : 'dias'}`;
}

export default function ComissaoScreen() {
  const { canUse } = useFeatureAccess();

  if (!canUse('comissao')) {
    return (
      <ProFeatureLock
        feature="comissao"
        emoji={feature.emoji}
        title={feature.title}
        description={feature.description}
      />
    );
  }

  return <ComissaoContent />;
}

function ComissaoContent() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [tab, setTab] = useState<Tab>('painel');
  const [filters, setFilters] = useState<CommissionFilters>(EMPTY_COMMISSION_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [items, setItems] = useState<CommissionWithInstallments[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  const today = dateKey(new Date());

  // Mesma função que o repositório usa para recortar as parcelas: o rótulo do
  // filtro e o que a lista devolve nunca podem divergir.
  const period = useMemo(
    () => resolveCommissionPeriod(filters),
    [filters],
  );

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const [list, comps] = await Promise.all([
      db.commissions.list(userId, filters),
      db.companies.list(userId),
    ]);
    setItems(list);
    setCompanies(comps);
    setLoading(false);
  }, [userId, filters]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const kpis = useMemo(() => computeCommissionKpis(items, today), [items, today]);

  const rows = useMemo(() => buildRows(items, today), [items, today]);

  const activeFilters =
    (filters.preset !== EMPTY_COMMISSION_FILTERS.preset ? 1 : 0) +
    (filters.basis !== EMPTY_COMMISSION_FILTERS.basis ? 1 : 0) +
    (filters.companyId ? 1 : 0) +
    (filters.status !== EMPTY_COMMISSION_FILTERS.status ? 1 : 0) +
    (filters.onlyLate ? 1 : 0) +
    (filters.query.trim() ? 1 : 0);

  function patch(next: Partial<CommissionFilters>) {
    setFilters((prev) => ({ ...prev, ...next }));
  }

  /** Resumo do filtro fechado: sempre diz qual data está mandando no período. */
  const filterSummary = useMemo(() => {
    const presetLabel = COMMISSION_PRESETS.find((x) => x.value === filters.preset)?.label ?? '';
    const janela =
      filters.preset === 'tudo'
        ? presetLabel
        : `${presetLabel} (${dateBR(period.from)} a ${dateBR(period.to)})`;
    return `Por ${BASIS_SHORT[filters.basis]} · ${janela}${filters.onlyLate ? ' · só atrasadas' : ''}`;
  }, [filters.preset, filters.basis, filters.onlyLate, period.from, period.to]);

  return (
    <Screen>
      <View style={styles.segment}>
        <Pressable
          style={[styles.segmentItem, tab === 'painel' && styles.segmentItemActive]}
          onPress={() => setTab('painel')}
        >
          <Text style={[styles.segmentText, tab === 'painel' && styles.segmentTextActive]}>
            Painel
          </Text>
        </Pressable>
        <Pressable
          style={[styles.segmentItem, tab === 'parcelas' && styles.segmentItemActive]}
          onPress={() => setTab('parcelas')}
        >
          <Text style={[styles.segmentText, tab === 'parcelas' && styles.segmentTextActive]}>
            Parcelas{rows.length > 0 ? ` (${rows.length})` : ''}
          </Text>
        </Pressable>
      </View>

      {/* Os filtros valem para as duas abas: o painel recalcula junto com a lista. */}
      <View style={styles.filterWrap}>
        <Pressable
          style={({ pressed }) => [styles.filterToggle, pressed && styles.pressed]}
          onPress={() => setFiltersOpen((v) => !v)}
          accessibilityRole="button"
        >
          <View style={styles.filterToggleText}>
            <Text style={styles.filterToggleLabel}>
              Filtros{activeFilters > 0 ? ` (${activeFilters})` : ''}
            </Text>
            <Text style={styles.filterToggleCaption} numberOfLines={1}>
              {filterSummary}
            </Text>
          </View>
          <Text style={styles.filterChevron}>{filtersOpen ? '⌃' : '⌄'}</Text>
        </Pressable>

        {filtersOpen ? (
          <View style={styles.filterBody}>
            <Select
              label="Período"
              placeholder="Escolha o período"
              value={filters.preset}
              options={COMMISSION_PRESETS}
              onChange={(v) => patch({ preset: v as CommissionPeriodPreset })}
            />

            {filters.preset === 'personalizado' ? (
              <View style={styles.row}>
                <View style={styles.col}>
                  <DateField label="De" value={filters.from} onChange={(v) => patch({ from: v })} />
                </View>
                <View style={styles.col}>
                  <DateField label="Até" value={filters.to} onChange={(v) => patch({ to: v })} />
                </View>
              </View>
            ) : null}

            <Select
              label="O período filtra por qual data"
              placeholder="Vencimento da parcela"
              value={filters.basis}
              options={BASIS_OPTIONS}
              onChange={(v) => patch({ basis: v as CommissionDateBasis })}
            />
            <Text style={styles.filterHint}>
              {filters.basis === 'vencimento'
                ? 'Mostra o que vence no período — é a leitura de cobrança.'
                : filters.basis === 'venda'
                  ? 'Mostra a comissão das vendas fechadas no período, mesmo que os recebimentos caiam depois.'
                  : 'Mostra o que entrou no caixa no período; parcelas ainda não recebidas ficam de fora.'}
            </Text>

            <Select
              label="Construtora"
              placeholder="Todas as construtoras"
              value={filters.companyId}
              options={companies.map((c) => ({ value: c.id, label: c.name }))}
              onChange={(v) => patch({ companyId: v })}
              emptyHint="Nenhuma empresa cadastrada."
              searchable
            />

            <Select
              label="Situação da parcela"
              placeholder="Todas as parcelas"
              value={filters.status}
              options={STATUS_OPTIONS}
              onChange={(v) => patch({ status: v as CommissionInstallmentStatus | 'todas' })}
            />

            <ToggleField
              label="Só parcelas atrasadas"
              value={filters.onlyLate}
              onChange={(v) => patch({ onlyLate: v })}
            />

            <Input
              label="Buscar"
              value={filters.query}
              onChangeText={(t) => patch({ query: t })}
              placeholder="Cliente, empreendimento ou construtora"
              autoCapitalize="none"
            />

            {activeFilters > 0 ? (
              <Button
                label="Limpar filtros"
                variant="secondary"
                onPress={() => setFilters(EMPTY_COMMISSION_FILTERS)}
              />
            ) : null}
          </View>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : tab === 'painel' ? (
        <Painel kpis={kpis} styles={styles} basis={filters.basis} />
      ) : (
        <Parcelas
          rows={rows}
          styles={styles}
          onChanged={() => void load()}
          onOpen={(commissionId) =>
            router.push({ pathname: '/(app)/comissao/[id]', params: { id: commissionId } })
          }
        />
      )}
    </Screen>
  );
}

/* ------------------------------------------------------------------------- *
 * Aba 1 — Painel: o que falta receber, o que já entrou e os ganhos
 * ------------------------------------------------------------------------- */

function Painel({
  kpis,
  styles,
  basis,
}: {
  kpis: CommissionKpis;
  styles: Styles;
  basis: CommissionDateBasis;
}) {
  const { width } = useWindowDimensions();
  // No desktop as duas colunas ficam largas demais para um número curto.
  const kpiWidth = width >= layout.desktopBreakpoint ? '33.3333%' : '50%';

  if (kpis.qtdParcelas === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyEmoji}>🪙</Text>
        <Text style={styles.emptyText}>
          Nenhuma comissão no período escolhido. A comissão é criada junto com a venda — registre a
          venda em “Vendas Realizadas” e as parcelas aparecem aqui.
        </Text>
      </View>
    );
  }

  const recebidoPorMes = kpis.recebidoPorMes.map((m) => ({ label: m.label, value: m.value }));
  const aReceberPorMes = kpis.aReceberPorMes.map((m) => ({ label: m.label, value: m.value }));

  return (
    <View>
      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>TOTAL A RECEBER</Text>
        <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>
          {brl(kpis.totalAReceber)}
        </Text>
        <Text style={styles.heroCaption}>
          {kpis.qtdPendentes} {kpis.qtdPendentes === 1 ? 'parcela em aberto' : 'parcelas em aberto'}
          {kpis.qtdAtrasadas > 0 ? ` · ${kpis.qtdAtrasadas} atrasada(s)` : ''}
        </Text>
        <Text style={styles.heroBasis}>Período por data de {BASIS_SHORT[basis]}</Text>
      </View>

      {kpis.proximoVencimento ? (
        <View style={styles.nextCard}>
          <Text style={styles.nextLabel}>PRÓXIMO VENCIMENTO</Text>
          <View style={styles.nextTop}>
            <Text style={styles.nextDate}>{dateBR(kpis.proximoVencimento.dueDate)}</Text>
            <Text style={styles.nextValue}>{brl(kpis.proximoVencimento.value)}</Text>
          </View>
          <Text style={styles.nextClient} numberOfLines={1}>
            {kpis.proximoVencimento.clientName}
          </Text>
          <Text
            style={[
              styles.nextPrazo,
              (daysFromToday(kpis.proximoVencimento.dueDate) ?? 0) < 0 && styles.nextPrazoLate,
            ]}
          >
            {prazoLabel(kpis.proximoVencimento.dueDate)}
          </Text>
        </View>
      ) : null}

      <View style={styles.kpiGrid}>
        <KpiCard
          styles={styles}
          width={kpiWidth}
          label="Já recebido"
          value={brl(kpis.totalRecebido)}
          tone="success"
          caption={`${kpis.qtdRecebidas} de ${kpis.qtdParcelas} parcela(s)`}
        />
        <KpiCard
          styles={styles}
          width={kpiWidth}
          label="Atrasado"
          value={brl(kpis.totalAtrasado)}
          tone={kpis.totalAtrasado > 0 ? 'danger' : 'neutral'}
          caption={
            kpis.qtdAtrasadas > 0 ? `${kpis.qtdAtrasadas} parcela(s) vencida(s)` : 'nada vencido'
          }
        />
        <KpiCard
          styles={styles}
          width={kpiWidth}
          label="% recebido"
          value={pct(kpis.percentualRecebido)}
          caption="do total previsto"
        />
        <KpiCard
          styles={styles}
          width={kpiWidth}
          label="Total previsto"
          value={brl(kpis.totalPrevisto)}
          caption={`${kpis.qtdComissoes} ${kpis.qtdComissoes === 1 ? 'comissão' : 'comissões'}`}
        />
        <KpiCard
          styles={styles}
          width={kpiWidth}
          label="Ticket médio"
          value={kpis.ticketMedioComissao === null ? '—' : brl(kpis.ticketMedioComissao)}
          caption="por comissão"
        />
        <KpiCard
          styles={styles}
          width={kpiWidth}
          label="Cancelado"
          value={brl(kpis.totalCancelado)}
          caption="fora da conta"
        />
      </View>

      <Section styles={styles} title="Recebido por mês">
        <BarChart data={recebidoPorMes} formatValue={abbreviateBRL} />
      </Section>

      <Section styles={styles} title="A receber por mês">
        <BarChart data={aReceberPorMes} formatValue={abbreviateBRL} />
      </Section>

      <Section styles={styles} title="Por construtora">
        <RankingBars
          data={kpis.porConstrutora.slice(0, 6).map((r) => ({
            label: r.label,
            value: r.previsto,
            caption: `${abbreviateBRL(r.recebido)} recebido · ${r.count} venda(s)`,
          }))}
          formatValue={abbreviateBRL}
        />
      </Section>
    </View>
  );
}

function KpiCard({
  styles,
  label,
  value,
  caption,
  width,
  tone = 'neutral',
}: {
  styles: Styles;
  label: string;
  value: string;
  caption?: string;
  width: string;
  tone?: 'neutral' | 'success' | 'danger';
}) {
  return (
    <View style={[styles.kpiCell, { width: width as `${number}%` }]}>
      <View style={styles.kpiCard}>
        <Text style={styles.kpiLabel} numberOfLines={2}>
          {label}
        </Text>
        <Text
          style={[
            styles.kpiValue,
            tone === 'success' && styles.kpiValueSuccess,
            tone === 'danger' && styles.kpiValueDanger,
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {value}
        </Text>
        {caption ? (
          <Text style={styles.kpiCaption} numberOfLines={1}>
            {caption}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function Section({
  styles,
  title,
  children,
}: {
  styles: Styles;
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

/* ------------------------------------------------------------------------- *
 * Aba 2 — Parcelas: a lista de acompanhamento, com baixa em um toque
 * ------------------------------------------------------------------------- */

interface Row {
  key: string;
  commissionId: string;
  inst: CommissionInstallment;
  count: number;
  clientName: string;
  developmentName: string | null;
  companyName: string | null;
  late: boolean;
}

/**
 * Achata comissões em linhas de parcela na ordem de acompanhamento:
 * atrasadas primeiro (da mais velha), depois as que vão vencer, depois as
 * recebidas (da mais recente) e por último as canceladas.
 */
function buildRows(items: CommissionWithInstallments[], today: string): Row[] {
  const rows: Row[] = [];
  for (const item of items) {
    for (const inst of item.installments) {
      rows.push({
        key: inst.id,
        commissionId: item.commission.id,
        inst,
        count: item.installments.length,
        clientName: item.commission.clientName,
        developmentName: item.commission.developmentName,
        companyName: item.commission.companyName,
        late: isInstallmentLate(inst, today),
      });
    }
  }

  const rank = (r: Row): number => {
    if (r.inst.status === 'cancelada') return 3;
    if (r.inst.status === 'recebida') return 2;
    return r.late ? 0 : 1;
  };

  return rows.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 2) {
      const pa = a.inst.paidDate ?? a.inst.dueDate;
      const pb = b.inst.paidDate ?? b.inst.dueDate;
      return pb.localeCompare(pa);
    }
    if (ra === 3) return b.inst.dueDate.localeCompare(a.inst.dueDate);
    return a.inst.dueDate.localeCompare(b.inst.dueDate);
  });
}

function Parcelas({
  rows,
  styles,
  onOpen,
  onChanged,
}: {
  rows: Row[];
  styles: Styles;
  onOpen: (commissionId: string) => void;
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastPaid, setLastPaid] = useState<{ id: string; label: string } | null>(null);

  /**
   * Baixa em um toque: grava a data de hoje e o valor previsto, que é o caso
   * normal. Para uma data ou um valor diferentes existe o "Desfazer" logo aqui
   * e a tela da comissão, onde a baixa pede data e valor recebido.
   */
  async function marcarRecebida(row: Row) {
    setError(null);
    setBusyId(row.inst.id);
    const hoje = dateKey(new Date());
    const res = await db.commissions.setInstallmentStatus(row.inst.id, 'recebida', {
      paidDate: hoje,
      paidValue: row.inst.value,
    });
    setBusyId(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setLastPaid({
      id: row.inst.id,
      label: `Parcela ${row.inst.number} de ${row.clientName} recebida em ${dateBR(hoje)} (${brl(row.inst.value)}).`,
    });
    onChanged();
  }

  async function desfazer(installmentId: string) {
    setError(null);
    setBusyId(installmentId);
    const res = await db.commissions.setInstallmentStatus(installmentId, 'pendente', {
      paidDate: null,
      paidValue: null,
    });
    setBusyId(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setLastPaid(null);
    onChanged();
  }

  if (rows.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyEmoji}>🔍</Text>
        <Text style={styles.emptyText}>Nenhuma parcela encontrada com esses filtros.</Text>
      </View>
    );
  }

  return (
    <View>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {lastPaid ? (
        <View style={styles.undoBanner}>
          <Text style={styles.undoText}>{lastPaid.label}</Text>
          <View style={styles.undoActions}>
            <Pressable
              onPress={() => void desfazer(lastPaid.id)}
              style={({ pressed }) => [styles.undoBtn, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Text style={styles.undoBtnText}>Desfazer</Text>
            </Pressable>
            <Pressable
              onPress={() => setLastPaid(null)}
              hitSlop={8}
              accessibilityLabel="Fechar aviso"
            >
              <Text style={styles.undoClose}>✕</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {rows.map((row) => {
        const { inst } = row;
        const divergiu =
          inst.status === 'recebida' &&
          inst.paidValue != null &&
          Math.abs(inst.paidValue - inst.value) >= 0.01;

        return (
          <View
            key={row.key}
            style={[
              styles.instRow,
              row.late && styles.instRowLate,
              inst.status === 'cancelada' && styles.instRowOff,
            ]}
          >
            <Pressable
              onPress={() => onOpen(row.commissionId)}
              style={({ pressed }) => [styles.instMain, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Abrir comissão de ${row.clientName}`}
            >
              <View style={styles.instLeft}>
                <Text style={styles.instClient} numberOfLines={1}>
                  {row.clientName}
                </Text>
                <Text style={styles.instMeta} numberOfLines={1}>
                  {row.developmentName?.trim() || 'Sem empreendimento'}
                  {row.companyName ? ` · ${row.companyName}` : ''}
                </Text>
                <Text style={styles.instMeta} numberOfLines={1}>
                  Parcela {inst.number} de {row.count} · vence {dateBR(inst.dueDate)}
                </Text>
                {inst.status === 'recebida' ? (
                  <Text style={styles.instPaid} numberOfLines={1}>
                    Recebida em {dateBR(inst.paidDate)}
                    {divergiu ? ` · ${brl(inst.paidValue ?? 0)}` : ''}
                  </Text>
                ) : null}
              </View>
              <View style={styles.instRight}>
                <Text
                  style={[styles.instValue, inst.status === 'cancelada' && styles.instValueOff]}
                  numberOfLines={1}
                >
                  {brl(inst.value)}
                </Text>
                <InstallmentStatusPill status={inst.status} late={row.late} />
              </View>
            </Pressable>

            {inst.status === 'pendente' ? (
              <View style={styles.instFooter}>
                <Text style={styles.instFooterHint} numberOfLines={1}>
                  {row.late ? prazoLabel(inst.dueDate) : 'Baixa com a data de hoje'}
                </Text>
                <Pressable
                  onPress={() => void marcarRecebida(row)}
                  disabled={busyId === inst.id}
                  style={({ pressed }) => [
                    styles.quickBtn,
                    pressed && styles.pressed,
                    busyId === inst.id && styles.quickBtnBusy,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Marcar parcela ${inst.number} de ${row.clientName} como recebida`}
                >
                  <Text style={styles.quickBtnText}>
                    {busyId === inst.id ? 'Salvando…' : '✓ Marcar recebida'}
                  </Text>
                </Pressable>
              </View>
            ) : inst.invoiceStatus !== 'nao_emitida' ? (
              <View style={styles.instFooter}>
                <Text
                  style={[
                    styles.instFooterHint,
                    inst.invoiceStatus === 'cancelada' && styles.instFooterHintBad,
                  ]}
                  numberOfLines={1}
                >
                  {inst.invoiceStatus === 'emitida'
                    ? 'Nota fiscal emitida'
                    : 'Nota fiscal cancelada'}
                  {inst.invoiceNumber ? ` · nº ${inst.invoiceNumber}` : ''}
                </Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    loader: { marginTop: spacing.xl },

    segment: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.lg,
      padding: 4,
      marginBottom: spacing.lg,
    },
    segmentItem: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md },
    segmentItemActive: { backgroundColor: colors.surface },
    segmentText: { ...typography.label, color: colors.inkMuted, textAlign: 'center' },
    segmentTextActive: { color: colors.primary },

    filterWrap: { marginBottom: spacing.lg },
    filterToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    filterToggleText: { flex: 1, gap: 2 },
    filterToggleLabel: { ...typography.label, color: colors.primary },
    filterToggleCaption: { ...typography.caption, color: colors.inkMuted },
    filterChevron: { ...typography.label, color: colors.primary },
    filterBody: {
      borderWidth: 1,
      borderColor: colors.border,
      borderTopWidth: 0,
      borderBottomLeftRadius: radius.lg,
      borderBottomRightRadius: radius.lg,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.lg,
    },
    filterHint: {
      ...typography.caption,
      color: colors.inkSubtle,
      marginTop: -spacing.md,
      marginBottom: spacing.lg,
    },
    row: { flexDirection: 'row', gap: spacing.md },
    col: { flex: 1 },

    heroCard: {
      backgroundColor: colors.primary,
      borderRadius: radius.lg,
      padding: spacing.xl,
      marginBottom: spacing.md,
    },
    heroLabel: {
      ...typography.caption,
      color: colors.white,
      fontWeight: '700',
      letterSpacing: 1.4,
      opacity: 0.9,
    },
    heroValue: { ...typography.title, color: colors.white, fontSize: 34, marginTop: spacing.xs },
    heroCaption: { ...typography.caption, color: colors.white, opacity: 0.9, marginTop: 2 },
    heroBasis: {
      ...typography.caption,
      color: colors.white,
      opacity: 0.8,
      marginTop: spacing.sm,
      fontSize: 12,
    },

    nextCard: {
      backgroundColor: colors.primarySoft,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: radius.lg,
      padding: spacing.lg,
      marginBottom: spacing.lg,
      gap: 2,
    },
    nextLabel: {
      ...typography.caption,
      color: colors.primary,
      fontWeight: '700',
      letterSpacing: 1,
      fontSize: 11,
    },
    nextTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      marginTop: 2,
    },
    nextDate: { ...typography.heading, color: colors.ink },
    nextValue: { ...typography.heading, color: colors.ink },
    nextClient: { ...typography.body, color: colors.inkMuted },
    nextPrazo: { ...typography.caption, color: colors.inkMuted },
    nextPrazoLate: { color: colors.danger, fontWeight: '700' },

    kpiGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginHorizontal: -spacing.xs,
      marginBottom: spacing.lg,
    },
    kpiCell: { padding: spacing.xs },
    kpiCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: 2,
      minHeight: 98,
      justifyContent: 'center',
    },
    kpiLabel: { ...typography.caption, color: colors.inkMuted, fontWeight: '600' },
    kpiValue: { ...typography.heading, color: colors.ink, fontSize: 20 },
    kpiValueSuccess: { color: colors.success },
    kpiValueDanger: { color: colors.danger },
    kpiCaption: { ...typography.caption, color: colors.inkSubtle, fontSize: 11 },

    section: { marginBottom: spacing.lg },
    sectionTitle: { ...typography.label, color: colors.ink, marginBottom: spacing.sm },
    sectionCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: spacing.lg,
    },

    instRow: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      marginBottom: spacing.md,
      overflow: 'hidden',
    },
    instRowLate: { borderColor: colors.danger },
    instRowOff: { opacity: 0.62 },
    instMain: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      padding: spacing.lg,
    },
    instLeft: { flex: 1, gap: 2 },
    instClient: { ...typography.body, color: colors.ink, fontWeight: '700' },
    instMeta: { ...typography.caption, color: colors.inkMuted },
    instPaid: { ...typography.caption, color: colors.success, fontWeight: '600' },
    instRight: { alignItems: 'flex-end', gap: spacing.sm },
    instValue: { ...typography.body, color: colors.ink, fontWeight: '700' },
    instValueOff: { color: colors.inkSubtle, textDecorationLine: 'line-through' },
    instFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surfaceAlt,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    instFooterHint: { ...typography.caption, color: colors.inkMuted, flex: 1, fontSize: 12 },
    instFooterHintBad: { color: colors.danger },
    quickBtn: {
      borderWidth: 1,
      borderColor: colors.success,
      backgroundColor: colors.successSoft,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      minHeight: 38,
      justifyContent: 'center',
    },
    quickBtnBusy: { opacity: 0.6 },
    quickBtnText: { ...typography.label, color: colors.success, fontSize: 13 },

    undoBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.successSoft,
      borderWidth: 1,
      borderColor: colors.success,
      borderRadius: radius.lg,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    undoText: { ...typography.caption, color: colors.success, flex: 1 },
    undoActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    undoBtn: {
      borderWidth: 1,
      borderColor: colors.success,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    undoBtnText: { ...typography.caption, color: colors.success, fontWeight: '700' },
    undoClose: { ...typography.label, color: colors.success },

    error: {
      ...typography.caption,
      color: colors.danger,
      backgroundColor: colors.dangerSoft,
      padding: spacing.md,
      borderRadius: radius.sm,
      marginBottom: spacing.md,
      overflow: 'hidden',
    },

    empty: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.md },
    emptyEmoji: { fontSize: 40 },
    emptyText: {
      ...typography.body,
      color: colors.inkMuted,
      textAlign: 'center',
      paddingHorizontal: spacing.lg,
    },

    pressed: { opacity: 0.6 },
  });
