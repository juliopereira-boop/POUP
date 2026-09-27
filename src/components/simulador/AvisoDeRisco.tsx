/**
 * PASSOU DO RISCO DA CONSTRUTORA — quanto passou e o que fazer.
 *
 * Não basta dizer "acima do risco": o corretor precisa saber QUANTO passou
 * (em % e em reais) e a regra de como resolver — a diferença vai para o ato do
 * cliente (o ato mínimo é o excedente). O botão "Somar ao ato" completa o ato.
 * Ver `analisarRisco`.
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
    <View style={[styles.caixa, risco.atoCobre && styles.caixaOk]}>
      <Text style={[styles.titulo, risco.atoCobre && styles.tituloOk]}>
        Acima do risco da construtora ({pct1(risco.riscoPct ?? 0)}) em {pct1(risco.excessoPct)}
      </Text>
      <Text style={styles.linha}>
        Risco desta simulação: {pct1(risco.pctAtual)}. Passou{' '}
        <Text style={styles.forte}>{brl(risco.excessoValor)}</Text> do limite.
      </Text>
      <Text style={styles.linha}>
        Regra: o valor que passa do risco entra no ato do cliente. Ato mínimo:{' '}
        <Text style={styles.forte}>{brl(risco.atoMinimo)}</Text>.
      </Text>
      {risco.atoCobre ? (
        <Text style={[styles.linha, styles.ok]}>✓ O ato cobre o valor acima do risco.</Text>
      ) : onSomarAoAto ? (
        <Button label={`Somar ${brl(risco.faltaNoAto)} ao ato`} variant="secondary" onPress={onSomarAoAto} />
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
    caixaOk: { backgroundColor: colors.successSoft },
    titulo: { ...typography.label, color: colors.danger },
    tituloOk: { color: colors.success },
    ok: { color: colors.success, fontWeight: '700' },
    linha: { ...typography.caption, color: colors.ink },
    forte: { fontWeight: '800' },
  });
