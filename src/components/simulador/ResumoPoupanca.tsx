/**
 * O RESULTADO, SEMPRE À VISTA.
 *
 * O cliente está na mesa e a pergunta dele é uma só: "quanto fica por mês?".
 * Este cartão fica fixo no topo do simulador e responde enquanto o corretor
 * digita — a parcela corre até o valor novo (`SlotNumber`), o que faz a conta
 * parecer viva em vez de um número que troca de repente.
 *
 * ===========================================================================
 * A PARCELA É A RESPOSTA; A POUPANÇA, O CONTEXTO
 * ===========================================================================
 * Os dois valores lado a lado, do mesmo tamanho, não cabem num celular: "R$
 * 245.000,00" em meia tela quebra em duas linhas. E nem deveriam ter o mesmo
 * peso — a parcela é o que o cliente decide; a poupança é de onde ela sai. Por
 * isso a parcela ocupa a largura toda, grande, e a poupança vem numa linha
 * própria logo abaixo.
 *
 * Duas formas: a completa, no bloco de valores, onde a conta está sendo feita;
 * e a compacta, no bloco da unidade, onde ela só precisa continuar visível.
 */
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SlotNumber } from '@/components/SlotNumber';
import { buildFlow, formatMonthYearBR } from '@/features/simulador/calc';
import { useSimulador } from '@/features/simulador/SimuladorProvider';
import { currencyToNumber } from '@/lib/masks';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

interface Props {
  compacto?: boolean;
  /** No compacto: leva de volta ao bloco de valores. */
  onEditar?: () => void;
}

export function ResumoPoupanca({ compacto = false, onEditar }: Props) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const sim = useSimulador();
  const flow = useMemo(() => buildFlow(sim), [sim]);

  const venda = currencyToNumber(sim.unitValue);
  const pct = venda > 0 ? (flow.poupanca / venda) * 100 : 0;
  const temConta = venda > 0;
  const temParcela = flow.mensaisCount > 0;
  const saldoFechado = Math.abs(flow.saldo) < 1;
  const risco = sim.companyRisk;
  const parcela = Math.max(0, flow.monthlyValue);

  if (compacto) {
    return (
      <View style={styles.cartaoCompacto}>
        <View style={styles.flex1}>
          <View style={styles.linhaBase}>
            <SlotNumber value={parcela} style={styles.parcelaCompacta} />
            <Text style={styles.sufixo}>{temParcela ? ` /mês · ${flow.mensaisCount}×` : ' /mês'}</Text>
          </View>
          <View style={styles.linhaBase}>
            <Text style={styles.rotuloPoupanca}>Poupança </Text>
            <SlotNumber value={flow.poupanca} style={[styles.poupancaValor, { color: colors.primary }]} />
          </View>
        </View>
        {onEditar ? (
          <Pressable onPress={onEditar} hitSlop={10} accessibilityRole="button">
            <Text style={styles.editar}>Editar valores</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.cartao}>
      <View style={styles.cabeca}>
        <Text style={styles.rotulo}>
          {temParcela ? `Parcela mensal · ${flow.mensaisCount}×` : 'Parcela mensal'}
        </Text>
        {risco != null && temConta ? (
          <Text style={[styles.chip, pct <= risco ? styles.chipOk : styles.chipRuim]}>
            {pct <= risco ? `Dentro do risco (${risco}%)` : `Acima do risco (${risco}%)`}
          </Text>
        ) : null}
      </View>

      <SlotNumber value={parcela} style={styles.parcela} />

      <View style={styles.poupancaLinha}>
        <View style={styles.linhaBase}>
          <Text style={styles.rotuloPoupanca}>Poupança </Text>
          <SlotNumber value={flow.poupanca} style={[styles.poupancaValor, { color: colors.primary }]} />
        </View>
        <Text style={styles.detalhe}>
          {temConta ? `${pct.toFixed(1).replace('.', ',')}% do valor de venda` : 'comece pelo valor de venda'}
          {temParcela && flow.mensalFirstDue ? ` · 1ª em ${formatMonthYearBR(flow.mensalFirstDue)}` : ''}
        </Text>
      </View>

      {temParcela && !saldoFechado ? (
        <Text style={[styles.chip, styles.chipRuim, styles.chipSolto]}>
          Falta distribuir {brl(flow.saldo)}
        </Text>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    flex1: { flex: 1 },
    cartao: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    cabeca: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    rotulo: { ...typography.caption, color: colors.inkMuted },
    parcela: { fontSize: 34, lineHeight: 42, letterSpacing: -0.6 },
    linhaBase: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' },
    poupancaLinha: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'baseline',
      columnGap: spacing.md,
      rowGap: 2,
      paddingTop: spacing.sm,
      marginTop: spacing.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    rotuloPoupanca: { ...typography.caption, color: colors.inkMuted },
    poupancaValor: { fontSize: 16, lineHeight: 22, fontWeight: '800', letterSpacing: -0.2 },
    detalhe: { ...typography.caption, color: colors.inkSubtle },
    chip: {
      ...typography.caption,
      fontWeight: '600',
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.pill,
      overflow: 'hidden',
    },
    chipSolto: { alignSelf: 'flex-start', marginTop: spacing.sm },
    chipOk: { color: colors.success, backgroundColor: colors.successSoft },
    chipRuim: { color: colors.danger, backgroundColor: colors.dangerSoft },

    cartaoCompacto: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    parcelaCompacta: { fontSize: 22, lineHeight: 28, letterSpacing: -0.3 },
    sufixo: { ...typography.caption, color: colors.inkMuted },
    editar: { ...typography.label, color: colors.primary },
  });
