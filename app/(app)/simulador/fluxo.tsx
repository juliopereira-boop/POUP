import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/Button';
import { DateField } from '@/components/DateField';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { SlotNumber } from '@/components/SlotNumber';
import { db, type Simulation, type SimulationInput } from '@/data';
import { buildFlow, computePoupanca, formatDateBR } from '@/features/simulador/calc';
import { generateProposal } from '@/features/simulador/proposal';
import { useSimulador } from '@/features/simulador/SimuladorProvider';
import { currencyToNumber, formatCurrencyBRL } from '@/lib/masks';
import { useAuth } from '@/providers/AuthProvider';
import { useProfile } from '@/providers/ProfileProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function SimuladorFluxo() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { user } = useAuth();
  const { profile } = useProfile();
  const sim = useSimulador();

  const [companyName, setCompanyName] = useState<string | null>(null);
  const [developmentName, setDevelopmentName] = useState<string | null>(null);
  const [deliveryDate, setDeliveryDate] = useState<string | null>(null);
  const [gerente, setGerente] = useState<string | null>(null);
  const [stored, setStored] = useState<Simulation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const [comps, devs, existing] = await Promise.all([
      db.companies.list(user.id),
      db.developments.list(user.id),
      // Em modo edição, carrega a simulação salva para preservar o snapshot.
      sim.editId ? db.simulations.get(sim.editId) : Promise.resolve(null),
    ]);
    setStored(existing);
    const comp = comps.find((c) => c.id === sim.companyId);
    const dev = devs.find((d) => d.id === sim.developmentId);
    // Em edição, se o cadastro foi alterado/excluído, mantém o valor salvo
    // (é por isso que guardamos o snapshot — o PDF continua fiel).
    setCompanyName(comp?.name ?? existing?.companyName ?? null);
    setDevelopmentName(dev?.name ?? existing?.developmentName ?? null);
    setDeliveryDate(dev?.deliveryDate ?? existing?.deliveryDate ?? null);
    setGerente(dev?.managerName ?? existing?.managerName ?? null);
  }, [user, sim.companyId, sim.developmentId, sim.editId]);

  useEffect(() => {
    void load();
  }, [load]);

  const poupanca = useMemo(() => computePoupanca(sim), [sim]);
  const flow = useMemo(() => buildFlow(sim), [sim]);

  /** Limita a quantidade ao máximo das regras de negócio da empresa. */
  function clampCount(text: string, max: number | null): string {
    const digits = text.replace(/[^0-9]/g, '');
    if (!digits) return '';
    const n = parseInt(digits, 10);
    if (max != null && n > max) return String(max);
    return String(n);
  }

  async function gerarProposta() {
    setError(null);
    if (!user) return;
    if (!sim.atoDueDate) return setError('Informe o vencimento do ato.');
    if (flow.mensaisCount <= 0) return setError('Informe a quantidade de parcelas mensais.');
    setGenerating(true);
    try {
      // Em edição, preserva a data original da proposta (o PDF e os "meses
      // para entrega" ficam consistentes com a geração original).
      const genDate =
        sim.editId && stored?.proposalDate
          ? stored.proposalDate
          : new Date().toISOString().slice(0, 10);
      await generateProposal({
        sim,
        profile,
        companyName,
        developmentName,
        deliveryDate,
        gerente,
        todayISO: genDate,
      });

      // A simulação concluída "migra" para Relatórios. Guardamos só os DADOS
      // (o PDF nunca é salvo — é sempre regerado sob demanda a partir daqui).
      const unitValue = currencyToNumber(sim.unitValue);
      const riskPct = unitValue > 0 ? (flow.poupanca / unitValue) * 100 : 0;
      const input: SimulationInput = {
        clientName: sim.proponent1.name.trim() || null,
        companyId: sim.companyId,
        companyName,
        developmentId: sim.developmentId,
        developmentName,
        monthlyValue: flow.monthlyValue,
        riskPct,
        withinRisk: sim.companyRisk != null && unitValue > 0 ? riskPct <= sim.companyRisk : null,
        unitValue,
        deliveryDate,
        managerName: gerente,
        proposalDate: genDate,
        state: sim.snapshot,
      };
      const result = sim.editId
        ? await db.simulations.update(sim.editId, input)
        : await db.simulations.create(user.id, input);
      if (!result.ok) {
        setError(`Proposta gerada, mas falha ao salvar em Relatórios: ${result.error}`);
        return;
      }

      // Limpa a simulação inteira (memória + rascunho) para não deixar dados de
      // um cliente "vazando" pra próxima simulação, e volta ao menu (a
      // simulação concluída já está salva e aparece em Relatórios).
      sim.reset();
      router.replace('/(app)');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  const saldoOk = Math.abs(flow.saldo) < 1;

  return (
    <Screen>
      <Text style={styles.step}>Etapa 5 de 5</Text>
      <Text style={styles.title}>Fluxo de pagamento</Text>

      <View style={styles.poupancaCard}>
        <Text style={styles.poupancaLabel}>Poupança do cliente</Text>
        <Text style={styles.poupancaValue}>{brl(poupanca)}</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* Ato */}
      <View style={styles.row}>
        <View style={styles.col}>
          <Input
            label="Ato do cliente"
            value={sim.ato}
            onChangeText={(t) => sim.setField('ato', formatCurrencyBRL(t))}
            placeholder="R$ 0,00"
            keyboardType="numeric"
          />
        </View>
        <View style={styles.col}>
          <DateField
            label="Vencimento"
            value={sim.atoDueDate}
            onChange={(iso) => sim.setField('atoDueDate', iso)}
          />
        </View>
      </View>

      {/* Mensais */}
      <View style={styles.row}>
        <View style={styles.col}>
          <Input
            label={`Parcelas mensais${sim.companyMaxInstallments ? ` (máx. ${sim.companyMaxInstallments})` : ''}`}
            value={sim.mensaisCount}
            onChangeText={(t) => sim.setField('mensaisCount', clampCount(t, sim.companyMaxInstallments))}
            placeholder="0"
            keyboardType="numeric"
          />
        </View>
        <View style={styles.col}>
          <ReadOnlyField label="1º vencimento" value={formatDateBR(flow.mensalFirstDue)} />
        </View>
      </View>

      {/* Valor mensal animado (o destaque) */}
      <View style={styles.slotCard}>
        <Text style={styles.slotLabel}>Valor da parcela mensal</Text>
        <SlotNumber value={flow.monthlyValue} />
      </View>

      {/* Semestrais */}
      {sim.semestralEnabled ? (
        <View style={styles.interCard}>
          <View style={styles.interHeader}>
            <Text style={styles.interTitle}>Semestrais (6 em 6 meses)</Text>
            <Button
              label="Remover"
              variant="ghost"
              onPress={() => sim.setField('semestralEnabled', false)}
            />
          </View>
          <View style={styles.row}>
            <View style={styles.col}>
              <Input
                label={`Quantidade${sim.companyMaxSemiannual ? ` (máx. ${sim.companyMaxSemiannual})` : ''}`}
                value={sim.semestralCount}
                onChangeText={(t) => sim.setField('semestralCount', clampCount(t, sim.companyMaxSemiannual))}
                placeholder="0"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.col}>
              <ReadOnlyField label="1º vencimento" value={formatDateBR(flow.semestralDueDates[0] ?? null)} />
            </View>
          </View>
          <Input
            label="Valor de cada semestral"
            value={sim.semestralValue}
            onChangeText={(t) => sim.setField('semestralValue', formatCurrencyBRL(t))}
            placeholder="R$ 0,00"
            keyboardType="numeric"
          />
        </View>
      ) : (
        <Button
          label="+ Semestrais"
          variant="secondary"
          onPress={() => sim.setField('semestralEnabled', true)}
          style={styles.addBtn}
        />
      )}

      {/* Anuais */}
      {sim.anualEnabled ? (
        <View style={styles.interCard}>
          <View style={styles.interHeader}>
            <Text style={styles.interTitle}>Anuais (1 vez por ano)</Text>
            <Button
              label="Remover"
              variant="ghost"
              onPress={() => sim.setField('anualEnabled', false)}
            />
          </View>
          <View style={styles.row}>
            <View style={styles.col}>
              <Input
                label={`Quantidade${sim.companyMaxAnnual ? ` (máx. ${sim.companyMaxAnnual})` : ''}`}
                value={sim.anualCount}
                onChangeText={(t) => sim.setField('anualCount', clampCount(t, sim.companyMaxAnnual))}
                placeholder="0"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.col}>
              <ReadOnlyField label="1º vencimento" value={formatDateBR(flow.anualDueDates[0] ?? null)} />
            </View>
          </View>
          <Input
            label="Valor de cada anual"
            value={sim.anualValue}
            onChangeText={(t) => sim.setField('anualValue', formatCurrencyBRL(t))}
            placeholder="R$ 0,00"
            keyboardType="numeric"
          />
        </View>
      ) : (
        <Button
          label="+ Anuais"
          variant="secondary"
          onPress={() => sim.setField('anualEnabled', true)}
          style={styles.addBtn}
        />
      )}

      {/* Saldo */}
      <View style={[styles.saldoCard, saldoOk ? styles.saldoOk : styles.saldoBad]}>
        <Text style={styles.saldoLabel}>Saldo a distribuir</Text>
        <Text style={[styles.saldoValue, saldoOk ? styles.saldoValueOk : styles.saldoValueBad]}>
          {brl(flow.saldo)}
        </Text>
      </View>

      <Button label="Gerar proposta" onPress={gerarProposta} loading={generating} style={styles.cta} />
    </Screen>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.roWrap}>
      <Text style={styles.roLabel}>{label}</Text>
      <View style={styles.roField}>
        <Text style={styles.roValue}>{value}</Text>
      </View>
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    step: { ...typography.caption, color: colors.primary, fontWeight: '700' },
    title: { ...typography.title, color: colors.ink, marginBottom: spacing.lg },
    poupancaCard: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.lg,
      padding: spacing.lg,
      marginBottom: spacing.lg,
      alignItems: 'center',
    },
    poupancaLabel: { ...typography.caption, color: colors.inkMuted },
    poupancaValue: { ...typography.title, color: colors.ink, marginTop: 2 },
    row: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' },
    col: { flex: 1 },
    slotCard: {
      alignItems: 'center',
      paddingVertical: spacing.lg,
      marginBottom: spacing.lg,
    },
    slotLabel: { ...typography.label, color: colors.inkMuted, marginBottom: spacing.sm },
    interCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: spacing.lg,
      marginBottom: spacing.lg,
      backgroundColor: colors.surface,
    },
    interHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    interTitle: { ...typography.heading, color: colors.ink },
    addBtn: { marginBottom: spacing.lg },
    saldoCard: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderRadius: radius.lg,
      borderWidth: 1,
      padding: spacing.lg,
      marginBottom: spacing.lg,
    },
    saldoOk: { backgroundColor: colors.successSoft, borderColor: colors.success },
    saldoBad: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
    saldoLabel: { ...typography.body, color: colors.ink, fontWeight: '600' },
    saldoValue: { ...typography.heading },
    saldoValueOk: { color: colors.success },
    saldoValueBad: { color: colors.danger },
    cta: { marginTop: spacing.sm },
    error: {
      ...typography.caption,
      color: colors.danger,
      backgroundColor: colors.dangerSoft,
      padding: spacing.md,
      borderRadius: 8,
      marginBottom: spacing.lg,
      overflow: 'hidden',
    },
    roWrap: { marginBottom: spacing.lg },
    roLabel: { ...typography.label, color: colors.inkMuted, marginBottom: spacing.sm },
    roField: {
      minHeight: 52,
      borderRadius: radius.md,
      backgroundColor: colors.border,
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },
    roValue: { ...typography.body, color: colors.inkMuted, fontWeight: '600' },
  });
