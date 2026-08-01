import { StyleSheet, Text, View } from 'react-native';

import { Input } from './Input';
import { currencyToNumber, formatCurrencyBRL } from '@/lib/masks';
import { spacing, typography, type AppColors } from '@/theme';
import { useThemedStyles } from '@/providers/ThemeProvider';

/**
 * Par de campos "% de comissão" + "comissão em R$".
 *
 * REGRA DE SINCRONIA (a mesma no registro e na edição da venda):
 * o último campo digitado manda e o outro é recalculado a partir dele.
 *   • digitou a % ......... a comissão em R$ vira `valor da venda × % / 100`;
 *   • digitou a comissão .. a % vira `comissão ÷ valor da venda × 100` (2 casas)
 *     e o valor digitado é preservado exatamente como está;
 *   • mudou o valor da venda (fora deste componente): quem chama usa
 *     `commissionFromPercent` para recalcular a comissão mantendo a %.
 * Assim nenhum arredondamento "corrige" o número que o corretor acabou de
 * digitar, e os dois campos sempre contam a mesma história.
 */

/** Máscara de porcentagem: dígitos, uma vírgula e no máximo 2 casas. */
export function maskPercent(text: string): string {
  const cleaned = text.replace(/[^\d,.]/g, '').replace(/\./g, ',');
  const parts = cleaned.split(',');
  const int = parts[0].slice(0, 3);
  if (parts.length === 1) return int;
  return `${int},${parts.slice(1).join('').slice(0, 2)}`;
}

export function percentToNumber(text: string): number {
  const n = parseFloat(text.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** Número → texto de porcentagem em PT-BR (sem zeros à direita inúteis). */
export function formatPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '';
  return String(Number(value.toFixed(2))).replace('.', ',');
}

/** Comissão em R$ (mascarada) a partir da %. Vazio quando não há como calcular. */
export function commissionFromPercent(saleValue: number, percentText: string): string {
  const percent = percentToNumber(percentText);
  if (!percentText.trim() || percent <= 0 || saleValue <= 0) return '';
  // centavos = valor × % / 100 × 100 = valor × %
  return formatCurrencyBRL(String(Math.round(saleValue * percent)));
}

/** % (texto) a partir da comissão em R$. Vazio quando não há como calcular. */
export function percentFromCommission(saleValue: number, commissionText: string): string {
  const value = currencyToNumber(commissionText);
  if (!commissionText.trim() || value <= 0 || saleValue <= 0) return '';
  return formatPercent((value / saleValue) * 100);
}

interface CommissionFieldsProps {
  /** Base do cálculo: o valor da venda já em número. */
  saleValue: number;
  percent: string;
  commission: string;
  onChange: (next: { percent: string; commission: string }) => void;
}

export function CommissionFields({
  saleValue,
  percent,
  commission,
  onChange,
}: CommissionFieldsProps) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View>
      <View style={styles.row}>
        <View style={styles.col}>
          <Input
            label="Comissão (%)"
            value={percent}
            onChangeText={(text) => {
              const next = maskPercent(text);
              onChange({ percent: next, commission: commissionFromPercent(saleValue, next) });
            }}
            placeholder="0,00"
            keyboardType="decimal-pad"
          />
        </View>
        <View style={styles.col}>
          <Input
            label="Comissão (R$)"
            value={commission}
            onChangeText={(text) => {
              const next = formatCurrencyBRL(text);
              onChange({ percent: percentFromCommission(saleValue, next), commission: next });
            }}
            placeholder="R$ 0,00"
            keyboardType="number-pad"
          />
        </View>
      </View>
      <Text style={styles.hint}>
        Os dois campos andam juntos: o último que você digitar recalcula o outro.
      </Text>
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', gap: spacing.md },
    col: { flex: 1 },
    hint: {
      ...typography.caption,
      color: colors.inkSubtle,
      marginTop: -spacing.sm,
      marginBottom: spacing.lg,
    },
  });
