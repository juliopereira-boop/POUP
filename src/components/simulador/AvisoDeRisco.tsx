/**
 * PASSOU DO RISCO DA CONSTRUTORA — quanto passou e o que fazer.
 *
 * Não basta dizer "acima do risco": o corretor precisa saber QUANTO passou
 * (em % e em reais) e a regra de como resolver — a diferença vai para o ato do
 * cliente. O botão "Somar ao ato" faz a conta por ele. Ver `analisarRisco`.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import type { AnaliseDeRisco } from '@/features/simulador/calc';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

export function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function pct1(n: number): string {
  return `${n.toFixed(1).replace('.', ',')}%`;
}

interface Props {
  risco: AnaliseDeRisco;
  /** Sem isto, o aviso só explica (sem o botão). */
  onSomarAoAto?: () => void;
}

export function AvisoDeRisco({ risco, onSomarAoAto }: Props) {
  const styles = useThemedStyles(makeStyles);
  if (!risco.aplica || risco.dentro) return null;
  return (
    <View style={styles.caixa}>
      <Text style={styles.titulo}>
        Acima do risco da construtora ({pct1(risco.riscoPct ?? 0)}) em {pct1(risco.excessoPct)}
      </Text>
      <Text style={styles.linha}>
        Risco desta simulação: {pct1(risco.pctAtual)} ({brl(risco.valorEmRisco)} pagos depois do ato).
      </Text>
      <Text style={styles.linha}>
        Passou <Text style={styles.forte}>{brl(risco.excessoValor)}</Text> do limite. Essa diferença precisa
        entrar no ato do cliente: ato mínimo de <Text style={styles.forte}>{brl(risco.atoMinimo)}</Text>.
      </Text>
      {onSomarAoAto ? (
        <Button label={`Somar ${brl(risco.excessoValor)} ao ato`} variant="secondary" onPress={onSomarAoAto} />
      ) : null}
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    caixa: {
      backgroundColor: colors.dangerSoft,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.xs,
      marginBottom: spacing.lg,
    },
    titulo: { ...typography.label, color: colors.danger },
    linha: { ...typography.caption, color: colors.ink },
    forte: { fontWeight: '800' },
  });
