import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { Button } from '@/components/Button';
import { DateField } from '@/components/DateField';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { Select } from '@/components/Select';
import { db, type Simulation } from '@/data';
import { useAuth } from '@/providers/AuthProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

function brl(n: number | null): string {
  return (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function pct(n: number | null): string {
  return `${(n ?? 0).toFixed(1).replace('.', ',')}%`;
}
function dateBR(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export default function RelatoriosScreen() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { user } = useAuth();

  const [sims, setSims] = useState<Simulation[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros — recolhidos por padrão; "Filtrar" abre/fecha o painel.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [clientQuery, setClientQuery] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [developmentFilter, setDevelopmentFilter] = useState('');
  const [fromDate, setFromDate] = useState<string | null>(null);
  const [toDate, setToDate] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setSims(await db.simulations.list(user.id));
    setLoading(false);
  }, [user]);

  // Recarrega ao focar (ex.: voltar do detalhe ou de concluir uma simulação).
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const companyOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sims) if (s.companyId) map.set(s.companyId, s.companyName ?? '—');
    return [
      { value: '', label: 'Todas as empresas' },
      ...[...map].map(([value, label]) => ({ value, label })),
    ];
  }, [sims]);

  const developmentOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sims) {
      if (!s.developmentId) continue;
      if (companyFilter && s.companyId !== companyFilter) continue;
      map.set(s.developmentId, s.developmentName ?? '—');
    }
    return [
      { value: '', label: 'Todos os empreendimentos' },
      ...[...map].map(([value, label]) => ({ value, label })),
    ];
  }, [sims, companyFilter]);

  const filtered = useMemo(
    () =>
      sims.filter((s) => {
        const q = clientQuery.trim().toLowerCase();
        if (q && !(s.clientName ?? '').toLowerCase().includes(q)) return false;
        if (companyFilter && s.companyId !== companyFilter) return false;
        if (developmentFilter && s.developmentId !== developmentFilter) return false;
        const day = s.createdAt.slice(0, 10);
        if (fromDate && day < fromDate) return false;
        if (toDate && day > toDate) return false;
        return true;
      }),
    [sims, clientQuery, companyFilter, developmentFilter, fromDate, toDate],
  );

  const activeFilterCount = [
    clientQuery,
    companyFilter,
    developmentFilter,
    fromDate,
    toDate,
  ].filter(Boolean).length;
  const hasFilters = activeFilterCount > 0;

  function clearFilters() {
    setClientQuery('');
    setCompanyFilter('');
    setDevelopmentFilter('');
    setFromDate(null);
    setToDate(null);
  }

  return (
    <Screen>
      <Text style={styles.title}>Relatórios</Text>
      <Text style={styles.subtitle}>Simulações concluídas.</Text>

      {loading ? (
        <Text style={styles.muted}>Carregando...</Text>
      ) : sims.length === 0 ? (
        // Sem nenhuma simulação: mostra só o estado vazio (filtros seriam inúteis).
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>📊</Text>
          <Text style={styles.emptyTitle}>Nenhuma simulação ainda</Text>
          <Text style={styles.emptyText}>
            Conclua uma simulação no Simulador de poupança e ela aparecerá aqui.
          </Text>
        </View>
      ) : (
        <>
          {/* Barra de filtros: recolhida por padrão, um único botão abre o painel. */}
          <View style={styles.filterBar}>
            <Pressable
              onPress={() => setFiltersOpen((v) => !v)}
              style={({ pressed }) => [
                styles.filterToggle,
                hasFilters && styles.filterToggleActive,
                pressed && styles.filterTogglePressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ expanded: filtersOpen }}
            >
              <Text style={[styles.filterToggleText, hasFilters && styles.filterToggleTextActive]}>
                {filtersOpen ? 'Ocultar filtros ▲' : 'Filtrar ▾'}
              </Text>
              {hasFilters ? (
                <View style={styles.filterCount}>
                  <Text style={styles.filterCountText}>{activeFilterCount}</Text>
                </View>
              ) : null}
            </Pressable>

            <Text style={styles.count}>
              {filtered.length === 1 ? '1 simulação' : `${filtered.length} simulações`}
              {hasFilters && sims.length !== filtered.length ? ` de ${sims.length}` : ''}
            </Text>
          </View>

          {filtersOpen ? (
            <View style={styles.filterCard}>
              <Input
                label="Cliente"
                value={clientQuery}
                onChangeText={setClientQuery}
                placeholder="Buscar por nome do cliente"
                autoCapitalize="words"
              />
              <Select
                label="Empresa"
                placeholder="Todas as empresas"
                value={companyFilter}
                options={companyOptions}
                onChange={(v) => {
                  setCompanyFilter(v);
                  setDevelopmentFilter(''); // troca de empresa reseta o empreendimento
                }}
              />
              <Select
                label="Empreendimento"
                placeholder="Todos os empreendimentos"
                value={developmentFilter}
                options={developmentOptions}
                onChange={setDevelopmentFilter}
              />
              <View style={[styles.row, styles.dateRow]}>
                <View style={styles.col}>
                  <DateField
                    label="De"
                    value={fromDate}
                    onChange={setFromDate}
                    placeholder="Início"
                  />
                </View>
                <View style={styles.col}>
                  <DateField label="Até" value={toDate} onChange={setToDate} placeholder="Fim" />
                </View>
              </View>
              {hasFilters ? (
                <Button
                  label="Limpar filtros"
                  variant="ghost"
                  onPress={clearFilters}
                  style={styles.clearBtn}
                />
              ) : null}
            </View>
          ) : null}

          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Nenhum resultado</Text>
              <Text style={styles.emptyText}>
                Nenhuma simulação corresponde aos filtros.
              </Text>
              <Button label="Limpar filtros" variant="secondary" onPress={clearFilters} />
            </View>
          ) : (
            filtered.map((s) => (
              <SimulationCard
                key={s.id}
                sim={s}
                onPress={() =>
                  router.push({ pathname: '/(app)/relatorios/[id]', params: { id: s.id } })
                }
              />
            ))
          )}
        </>
      )}
    </Screen>
  );
}

function SimulationCard({ sim, onPress }: { sim: Simulation; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const neutral = sim.withinRisk == null;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${sim.clientName?.trim() || 'Cliente não informado'}, ${
        sim.developmentName?.trim() || 'empreendimento não informado'
      }, parcela mensal ${brl(sim.monthlyValue)}, risco ${pct(sim.riskPct)}`}
    >
      <View style={styles.cardTop}>
        <Text style={styles.cardClient} numberOfLines={1}>
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
            {neutral ? pct(sim.riskPct) : `${sim.withinRisk ? '✓' : '⚠'} ${pct(sim.riskPct)}`}
          </Text>
        </View>
      </View>

      <Text style={styles.cardDev} numberOfLines={1}>
        {sim.developmentName?.trim() || '—'}
        {sim.companyName ? <Text style={styles.cardCompany}>{`  ·  ${sim.companyName}`}</Text> : null}
      </Text>

      <View style={styles.cardBottom}>
        <View>
          <Text style={styles.cardMonthlyLabel}>Parcela mensal</Text>
          <Text style={styles.cardMonthly}>{brl(sim.monthlyValue)}</Text>
        </View>
        <Text style={styles.cardDate}>{dateBR(sim.createdAt)}</Text>
      </View>
    </Pressable>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    title: { ...typography.title, color: colors.ink },
    subtitle: { ...typography.body, color: colors.inkMuted, marginBottom: spacing.lg },
    filterBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    filterToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    filterToggleActive: { borderColor: colors.primary },
    filterTogglePressed: { opacity: 0.7 },
    filterToggleText: { ...typography.label, color: colors.ink },
    filterToggleTextActive: { color: colors.primary },
    filterCount: {
      minWidth: 20,
      height: 20,
      borderRadius: radius.pill,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xs,
    },
    filterCountText: { ...typography.caption, color: colors.white, fontWeight: '700', fontSize: 11 },
    filterCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginBottom: spacing.lg,
    },
    row: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' },
    // Cancela a margem inferior embutida dos DateFields para não dobrar o
    // espaçamento antes do botão / borda do card de filtros.
    dateRow: { marginBottom: -spacing.lg },
    clearBtn: { marginTop: spacing.lg },
    col: { flex: 1 },
    count: { ...typography.caption, color: colors.inkMuted },
    muted: { ...typography.body, color: colors.inkSubtle },
    empty: {
      alignItems: 'center',
      paddingVertical: spacing.xxl,
      gap: spacing.sm,
    },
    emptyEmoji: { fontSize: 40 },
    emptyTitle: { ...typography.heading, color: colors.ink },
    emptyText: { ...typography.body, color: colors.inkMuted, textAlign: 'center' },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    cardPressed: { opacity: 0.7 },
    cardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      marginBottom: 2,
    },
    cardClient: { ...typography.heading, color: colors.ink, flexShrink: 1 },
    cardDev: { ...typography.body, color: colors.inkMuted, marginBottom: spacing.md },
    cardCompany: { color: colors.inkSubtle },
    cardBottom: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
    },
    cardMonthlyLabel: { ...typography.caption, color: colors.inkSubtle },
    cardMonthly: { ...typography.heading, color: colors.primary },
    cardDate: { ...typography.caption, color: colors.inkSubtle },
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
  });
