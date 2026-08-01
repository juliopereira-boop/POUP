import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { BarChart } from '@/components/charts/BarChart';
import { abbreviateBRL } from '@/components/charts/format';
import { RankingBars } from '@/components/charts/RankingBars';
import { StackedShare } from '@/components/charts/StackedShare';
import { Button } from '@/components/Button';
import { DateField } from '@/components/DateField';
import { Input } from '@/components/Input';
import { ProFeatureLock } from '@/components/ProFeatureLock';
import { Screen } from '@/components/Screen';
import { Select } from '@/components/Select';
import {
  db,
  EMPTY_SALE_FILTERS,
  type Company,
  type Development,
  type Sale,
  type SaleFilters,
  type SalePeriodPreset,
  type SaleStatus,
} from '@/data';
import { FEATURES } from '@/features/registry';
import { useFeatureAccess } from '@/features/useFeatureAccess';
import { computeSaleKpis, type SaleKpis } from '@/features/vendas/kpis';
import { resolvePeriod } from '@/features/vendas/period';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

const feature = FEATURES.find((f) => f.key === 'vendas')!;

type Tab = 'painel' | 'lista';
type Styles = ReturnType<typeof makeStyles>;

const PRESETS: { value: SalePeriodPreset; label: string }[] = [
  { value: 'mes_atual', label: 'Este mês' },
  { value: 'mes_passado', label: 'Mês passado' },
  { value: 'ultimos_3_meses', label: 'Últimos 3 meses' },
  { value: 'ultimos_12_meses', label: 'Últimos 12 meses' },
  { value: 'ano_atual', label: 'Este ano' },
  { value: 'tudo', label: 'Todo o histórico' },
  { value: 'personalizado', label: 'Período personalizado' },
];

const STATUS_OPTIONS: { value: SaleStatus | 'todas'; label: string }[] = [
  { value: 'ativa', label: 'Somente ativas' },
  { value: 'distratada', label: 'Somente distratadas' },
  { value: 'todas', label: 'Ativas e distratadas' },
];

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function pct(n: number | null): string {
  if (n === null) return '—';
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

function dias(n: number | null): string {
  if (n === null) return '—';
  const v = Math.round(n);
  return `${v} ${v === 1 ? 'dia' : 'dias'}`;
}

function dateBR(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

export default function VendasScreen() {
  const { canUse } = useFeatureAccess();

  if (!canUse('vendas')) {
    return (
      <ProFeatureLock
        emoji={feature.emoji}
        title={feature.title}
        description={feature.description}
      />
    );
  }

  return <VendasContent />;
}

function VendasContent() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [tab, setTab] = useState<Tab>('painel');
  const [filters, setFilters] = useState<SaleFilters>(EMPTY_SALE_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [sales, setSales] = useState<Sale[]>([]);
  const [leadsCount, setLeadsCount] = useState(0);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [developments, setDevelopments] = useState<Development[]>([]);
  const [loading, setLoading] = useState(true);

  const period = useMemo(() => resolvePeriod(filters), [filters]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const [list, leads, comps, devs] = await Promise.all([
      db.sales.list(userId, filters),
      db.sales.countLeadsInRange(userId, period.from, period.to),
      db.companies.list(userId),
      db.developments.list(userId),
    ]);
    setSales(list);
    setLeadsCount(leads);
    setCompanies(comps);
    setDevelopments(devs);
    setLoading(false);
  }, [userId, filters, period.from, period.to]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const kpis = useMemo(() => computeSaleKpis(sales, leadsCount), [sales, leadsCount]);

  const filterDevs = useMemo(
    () =>
      filters.companyId
        ? developments.filter((d) => d.companyId === filters.companyId)
        : developments,
    [developments, filters.companyId],
  );

  const activeFilters =
    (filters.preset !== EMPTY_SALE_FILTERS.preset ? 1 : 0) +
    (filters.companyId ? 1 : 0) +
    (filters.developmentId ? 1 : 0) +
    (filters.status !== EMPTY_SALE_FILTERS.status ? 1 : 0) +
    (filters.query.trim() ? 1 : 0);

  function patch(next: Partial<SaleFilters>) {
    setFilters((prev) => ({ ...prev, ...next }));
  }

  const periodoLabel = useMemo(() => {
    const p = PRESETS.find((x) => x.value === filters.preset)?.label ?? '';
    if (filters.preset !== 'personalizado') return p;
    const de = filters.from ? dateBR(filters.from) : 'início';
    const ate = filters.to ? dateBR(filters.to) : 'hoje';
    return `${de} até ${ate}`;
  }, [filters.preset, filters.from, filters.to]);

  return (
    <Screen>
      <Text style={styles.title}>Vendas Realizadas</Text>

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
          style={[styles.segmentItem, tab === 'lista' && styles.segmentItemActive]}
          onPress={() => setTab('lista')}
        >
          <Text style={[styles.segmentText, tab === 'lista' && styles.segmentTextActive]}>
            Vendas{sales.length > 0 ? ` (${sales.length})` : ''}
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
              {periodoLabel}
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
              options={PRESETS}
              onChange={(v) => patch({ preset: v as SalePeriodPreset })}
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
              label="Construtora"
              placeholder="Todas as construtoras"
              value={filters.companyId}
              options={companies.map((c) => ({ value: c.id, label: c.name }))}
              onChange={(v) => patch({ companyId: v, developmentId: null })}
              emptyHint="Nenhuma empresa cadastrada."
              searchable
            />

            <Select
              label="Empreendimento"
              placeholder="Todos os empreendimentos"
              value={filters.developmentId}
              options={filterDevs.map((d) => ({ value: d.id, label: d.name }))}
              onChange={(v) => patch({ developmentId: v })}
              emptyHint="Nenhum empreendimento cadastrado."
              searchable
            />

            <Select
              label="Situação"
              placeholder="Somente ativas"
              value={filters.status}
              options={STATUS_OPTIONS}
              onChange={(v) => patch({ status: v as SaleStatus | 'todas' })}
            />

            <Input
              label="Buscar"
              value={filters.query}
              onChangeText={(t) => patch({ query: t })}
              placeholder="Cliente, CPF ou unidade"
              autoCapitalize="none"
            />

            {activeFilters > 0 ? (
              <Button
                label="Limpar filtros"
                variant="secondary"
                onPress={() => setFilters(EMPTY_SALE_FILTERS)}
              />
            ) : null}
          </View>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : tab === 'painel' ? (
        <Painel kpis={kpis} styles={styles} colors={colors} />
      ) : (
        <Lista
          sales={sales}
          styles={styles}
          onOpen={(id) => router.push({ pathname: '/(app)/vendas/[id]', params: { id } })}
        />
      )}
    </Screen>
  );
}

/* ------------------------------------------------------------------------- *
 * Aba 1 — Painel de indicadores
 * ------------------------------------------------------------------------- */

function Painel({
  kpis,
  styles,
  colors,
}: {
  kpis: SaleKpis;
  styles: Styles;
  colors: AppColors;
}) {
  if (kpis.totalVendas === 0 && kpis.totalDistratos === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyEmoji}>🤝</Text>
        <Text style={styles.emptyText}>
          Nenhuma venda no período escolhido. Para registrar, abra o relatório de uma simulação e
          toque em “Registrar venda realizada”.
        </Text>
      </View>
    );
  }

  const composicao = kpis.composicao.filter((c) => c.value > 0);
  const paleta = [colors.primary, colors.success, colors.warning, colors.inkSubtle];

  return (
    <View>
      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>VGV DO PERÍODO</Text>
        <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>
          {brl(kpis.vgv)}
        </Text>
        <Text style={styles.heroCaption}>
          {kpis.totalVendas} {kpis.totalVendas === 1 ? 'venda ativa' : 'vendas ativas'}
          {kpis.totalDistratos > 0 ? ` · ${kpis.totalDistratos} distratada(s)` : ''}
        </Text>
      </View>

      <View style={styles.kpiGrid}>
        <KpiCard styles={styles} label="Ticket médio" value={brl(kpis.ticketMedio ?? 0)} />
        <KpiCard
          styles={styles}
          label="Comissão estimada"
          value={brl(kpis.comissaoTotal)}
          tone="success"
        />
        <KpiCard
          styles={styles}
          label="Ciclo médio de venda"
          value={dias(kpis.cicloMedioDias)}
          caption={
            kpis.cicloMedioBase > 0
              ? `base: ${kpis.cicloMedioBase} venda(s)`
              : 'sem origem registrada'
          }
        />
        <KpiCard
          styles={styles}
          label="Taxa de conversão"
          value={pct(kpis.taxaConversao)}
          caption={`${kpis.leadsNoPeriodo} lead(s) no período`}
        />
        <KpiCard
          styles={styles}
          label="Taxa de distrato"
          value={pct(kpis.taxaDistrato)}
          tone={kpis.taxaDistrato !== null && kpis.taxaDistrato > 10 ? 'danger' : 'neutral'}
        />
        <KpiCard
          styles={styles}
          label="Vendas no total"
          value={String(kpis.totalVendas + kpis.totalDistratos)}
          caption="ativas + distratadas"
        />
      </View>

      <Section styles={styles} title="VGV por mês">
        <BarChart
          data={kpis.vgvPorMes.map((m) => ({ label: m.label, value: m.vgv }))}
          formatValue={abbreviateBRL}
        />
      </Section>

      <Section styles={styles} title="Top empreendimentos">
        <RankingBars
          data={kpis.porEmpreendimento.slice(0, 6).map((r) => ({
            label: r.label,
            value: r.vgv,
            caption: `${r.count} venda(s)`,
          }))}
          formatValue={abbreviateBRL}
        />
      </Section>

      <Section styles={styles} title="Top construtoras">
        <RankingBars
          data={kpis.porConstrutora.slice(0, 6).map((r) => ({
            label: r.label,
            value: r.vgv,
            caption: `${r.count} venda(s)`,
          }))}
          formatValue={abbreviateBRL}
        />
      </Section>

      {composicao.length > 0 ? (
        <Section styles={styles} title="Composição do pagamento">
          <StackedShare
            data={composicao.map((c, i) => ({
              label: c.label,
              value: c.value,
              color: paleta[i % paleta.length],
            }))}
            formatValue={brl}
          />
        </Section>
      ) : null}
    </View>
  );
}

function KpiCard({
  styles,
  label,
  value,
  caption,
  tone = 'neutral',
}: {
  styles: Styles;
  label: string;
  value: string;
  caption?: string;
  tone?: 'neutral' | 'success' | 'danger';
}) {
  return (
    <View style={styles.kpiCell}>
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
 * Aba 2 — Listagem
 * ------------------------------------------------------------------------- */

function Lista({
  sales,
  styles,
  onOpen,
}: {
  sales: Sale[];
  styles: Styles;
  onOpen: (id: string) => void;
}) {
  if (sales.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyEmoji}>🔍</Text>
        <Text style={styles.emptyText}>Nenhuma venda encontrada com esses filtros.</Text>
      </View>
    );
  }

  return (
    <View>
      {sales.map((s) => (
        <Pressable
          key={s.id}
          onPress={() => onOpen(s.id)}
          style={({ pressed }) => [styles.saleRow, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <View style={styles.saleMain}>
            <Text style={styles.saleClient} numberOfLines={1}>
              {s.clientName}
            </Text>
            <Text style={styles.saleMeta} numberOfLines={1}>
              {s.developmentName ?? 'Sem empreendimento'}
              {s.unit ? ` · un. ${s.unit}` : ''}
            </Text>
            <Text style={styles.saleMeta} numberOfLines={1}>
              {s.companyName ?? 'Sem construtora'} · {dateBR(s.saleDate)}
            </Text>
          </View>
          <View style={styles.saleRight}>
            <Text style={styles.saleValue}>{brl(s.saleValue)}</Text>
            {s.status === 'distratada' ? (
              <Text style={styles.saleDistrato}>DISTRATADA</Text>
            ) : s.commissionValue ? (
              <Text style={styles.saleCommission}>{brl(s.commissionValue)}</Text>
            ) : null}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    title: { ...typography.title, color: colors.primary, marginBottom: spacing.lg },
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
    row: { flexDirection: 'row', gap: spacing.md },
    col: { flex: 1 },

    heroCard: {
      backgroundColor: colors.primary,
      borderRadius: radius.lg,
      padding: spacing.xl,
      marginBottom: spacing.lg,
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

    kpiGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginHorizontal: -spacing.xs,
      marginBottom: spacing.lg,
    },
    kpiCell: { width: '50%', padding: spacing.xs },
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

    saleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    saleMain: { flex: 1, gap: 2 },
    saleClient: { ...typography.body, color: colors.ink, fontWeight: '700' },
    saleMeta: { ...typography.caption, color: colors.inkMuted },
    saleRight: { alignItems: 'flex-end', gap: 2 },
    saleValue: { ...typography.body, color: colors.ink, fontWeight: '700' },
    saleCommission: { ...typography.caption, color: colors.success, fontWeight: '600' },
    saleDistrato: { ...typography.caption, color: colors.danger, fontWeight: '700' },

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
