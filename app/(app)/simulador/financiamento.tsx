import { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { SwipeToDelete } from '@/components/SwipeToDelete';
import { useSimulador } from '@/features/simulador/SimuladorProvider';
import { currencyToNumber, formatCurrencyBRL } from '@/lib/masks';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function SimuladorFinanciamento() {
  const styles = useThemedStyles(makeStyles);
  const sim = useSimulador();
  const [warningOpen, setWarningOpen] = useState(false);
  const [couponOpen, setCouponOpen] = useState(false);

  // --- Cálculo do risco em tempo real ---
  const calc = useMemo(() => {
    const unitValue = currencyToNumber(sim.unitValue);
    const financing = currencyToNumber(sim.financingApproved);
    const subsidy = currencyToNumber(sim.subsidy);
    const fgts = currencyToNumber(sim.fgts);

    let coupon = 0;
    if (sim.couponType === 'R$') coupon = currencyToNumber(sim.couponValue);
    else if (sim.couponType === '%') {
      const pct = parseFloat(sim.couponValue.replace(',', '.')) || 0;
      coupon = (unitValue * pct) / 100;
    }

    const financingSum = financing + subsidy + fgts;
    const financingTotal = financingSum + coupon;
    const poupanca = unitValue - financingTotal;
    const poupancaPct = unitValue > 0 ? (poupanca / unitValue) * 100 : 0;
    return { unitValue, financingSum, poupanca, poupancaPct };
  }, [
    sim.unitValue,
    sim.financingApproved,
    sim.subsidy,
    sim.fgts,
    sim.couponType,
    sim.couponValue,
  ]);

  const risk = sim.companyRisk;
  const hasRisk = risk != null;
  const withinRisk = hasRisk && calc.poupancaPct <= risk;

  function pressCoupon() {
    if (!sim.couponWarningSeen) {
      setWarningOpen(true);
      return;
    }
    setCouponOpen((v) => !v);
  }

  function closeWarning() {
    sim.setField('couponWarningSeen', true);
    setWarningOpen(false);
  }

  function setCouponType(type: 'R$' | '%') {
    sim.setField('couponType', type);
    sim.setField('couponValue', '');
  }

  function clearCoupon() {
    sim.setField('couponType', null);
    sim.setField('couponValue', '');
    setCouponOpen(false);
  }

  function advance() {
    if (Platform.OS === 'web') window.alert('Valores salvos! Próxima etapa em breve.');
  }

  return (
    <Screen>
      <Text style={styles.step}>Etapa 4 de 4</Text>
      <Text style={styles.title}>Valores de Financiamento</Text>

      <Input
        label="Financiamento aprovado"
        value={sim.financingApproved}
        onChangeText={(t) => sim.setField('financingApproved', formatCurrencyBRL(t))}
        placeholder="R$ 0,00"
        keyboardType="numeric"
      />
      <Input
        label="Subsídio aprovado"
        value={sim.subsidy}
        onChangeText={(t) => sim.setField('subsidy', formatCurrencyBRL(t))}
        placeholder="R$ 0,00"
        keyboardType="numeric"
      />
      <Input
        label="FGTS"
        value={sim.fgts}
        onChangeText={(t) => sim.setField('fgts', formatCurrencyBRL(t))}
        placeholder="R$ 0,00"
        keyboardType="numeric"
      />

      {/* Risco da poupança (somente leitura, do cadastro da empresa) */}
      <Text style={styles.label}>Risco da poupança (cadastro)</Text>
      <View style={styles.readonlyField}>
        <Text style={styles.readonlyText}>{hasRisk ? `${risk}%` : 'Não cadastrado'}</Text>
      </View>

      {/* Cupom */}
      <View style={styles.couponRow}>
        <Pressable onPress={pressCoupon} style={styles.couponButton} accessibilityLabel="Cupom">
          <Text style={styles.couponPlus}>+</Text>
        </Pressable>
        <Text style={styles.couponLabel}>Cupom</Text>
        {sim.couponType ? (
          <View style={styles.couponTagWrap}>
            <SwipeToDelete onDelete={clearCoupon}>
              <View style={styles.couponTagInner}>
                <Text style={styles.couponValueTag}>
                  {sim.couponType === 'R$'
                    ? formatCurrencyBRL(sim.couponValue) || 'R$ 0,00'
                    : `${sim.couponValue || '0'}%`}
                </Text>
              </View>
            </SwipeToDelete>
          </View>
        ) : null}
      </View>

      {couponOpen ? (
        <View style={styles.couponBox}>
          <View style={styles.segment}>
            {(['R$', '%'] as const).map((t) => {
              const active = sim.couponType === t;
              return (
                <Pressable
                  key={t}
                  onPress={() => setCouponType(t)}
                  style={[styles.segmentItem, active && styles.segmentItemActive]}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{t}</Text>
                </Pressable>
              );
            })}
          </View>
          {sim.couponType === 'R$' ? (
            <Input
              label="Valor do desconto"
              value={sim.couponValue}
              onChangeText={(t) => sim.setField('couponValue', formatCurrencyBRL(t))}
              placeholder="R$ 0,00"
              keyboardType="numeric"
            />
          ) : sim.couponType === '%' ? (
            <Input
              label="Percentual sobre o valor da unidade"
              value={sim.couponValue}
              onChangeText={(t) => sim.setField('couponValue', t.replace(/[^0-9.,]/g, ''))}
              placeholder="Ex.: 5"
              keyboardType="numeric"
            />
          ) : (
            <Text style={styles.couponHint}>Escolha o tipo de desconto acima.</Text>
          )}
        </View>
      ) : null}

      {/* Status do risco (atualiza em tempo real) */}
      <View
        style={[
          styles.statusCard,
          !hasRisk ? styles.statusNeutral : withinRisk ? styles.statusOk : styles.statusBad,
        ]}
      >
        <Text
          style={[
            styles.statusTitle,
            !hasRisk ? styles.statusTitleNeutral : withinRisk ? styles.statusTitleOk : styles.statusTitleBad,
          ]}
        >
          {!hasRisk
            ? 'Cadastre o risco da empresa para avaliar'
            : withinRisk
              ? '✓ Dentro do risco'
              : '⚠ Ultrapassou o risco'}
        </Text>
        {hasRisk ? (
          <Text style={styles.statusSub}>
            Poupança: {calc.poupancaPct.toFixed(1)}% · Risco máx.: {risk}%
          </Text>
        ) : null}

        <View style={styles.summary}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Valor da poupança</Text>
            <Text style={styles.summaryValue}>{brl(calc.poupanca)}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Valor de financiamento</Text>
            <Text style={styles.summaryValue}>{brl(calc.financingSum)}</Text>
          </View>
        </View>
      </View>

      <Button label="Avançar" onPress={advance} style={styles.cta} />

      {/* Aviso do cupom */}
      <Modal visible={warningOpen} transparent animationType="fade" onRequestClose={closeWarning}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Pressable onPress={closeWarning} style={styles.modalClose} accessibilityLabel="Fechar">
              <Text style={styles.modalCloseText}>✕</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Atenção</Text>
            <Text style={styles.modalText}>
              O cupom informado será validado pela construtora antes da confirmação da venda.
            </Text>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    step: { ...typography.caption, color: colors.primary, fontWeight: '700' },
    title: { ...typography.title, color: colors.ink, marginBottom: spacing.xl },
    label: { ...typography.label, color: colors.inkMuted, marginBottom: spacing.sm },
    readonlyField: {
      minHeight: 52,
      borderRadius: radius.md,
      backgroundColor: colors.border,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.lg,
    },
    readonlyText: { ...typography.body, color: colors.inkMuted, fontWeight: '600' },

    couponRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
    couponButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.successSoft,
      borderWidth: 1,
      borderColor: colors.success,
      alignItems: 'center',
      justifyContent: 'center',
    },
    couponPlus: { color: colors.success, fontSize: 24, lineHeight: 26, fontWeight: '700' },
    couponLabel: { ...typography.body, color: colors.ink, fontWeight: '600' },
    couponTagWrap: { flex: 1 },
    couponTagInner: {
      backgroundColor: colors.successSoft,
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      alignSelf: 'flex-start',
    },
    couponValueTag: { ...typography.label, color: colors.success },
    couponBox: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.lg,
      marginBottom: spacing.lg,
      backgroundColor: colors.surface,
    },
    segment: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.md,
      padding: 3,
      marginBottom: spacing.lg,
      alignSelf: 'flex-start',
    },
    segmentItem: { paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, borderRadius: radius.sm },
    segmentItemActive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    segmentText: { ...typography.label, color: colors.inkMuted },
    segmentTextActive: { color: colors.primary },
    couponHint: { ...typography.caption, color: colors.inkSubtle },

    statusCard: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, marginTop: spacing.sm },
    statusNeutral: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
    statusOk: { backgroundColor: colors.successSoft, borderColor: colors.success },
    statusBad: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
    statusTitle: { ...typography.heading },
    statusTitleNeutral: { color: colors.inkMuted },
    statusTitleOk: { color: colors.success },
    statusTitleBad: { color: colors.danger },
    statusSub: { ...typography.caption, color: colors.inkMuted, marginTop: 4 },
    summary: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.lg },
    summaryItem: { flex: 1 },
    summaryLabel: { ...typography.caption, color: colors.inkMuted },
    summaryValue: { ...typography.heading, color: colors.ink, marginTop: 2 },

    cta: { marginTop: spacing.xl },

    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
    },
    modalCard: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.xl,
    },
    modalClose: { position: 'absolute', top: spacing.md, right: spacing.md, padding: spacing.xs },
    modalCloseText: { ...typography.body, color: colors.inkSubtle, fontSize: 18 },
    modalTitle: { ...typography.heading, color: colors.warning, marginBottom: spacing.sm },
    modalText: { ...typography.body, color: colors.ink },
  });
