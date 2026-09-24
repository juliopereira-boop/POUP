/**
 * AS DUAS ETAPAS DO SIMULADOR, E ONDE O CORRETOR ESTÁ.
 *
 * Dois passos, e não cinco: o corretor precisa enxergar que falta pouco. A
 * etapa que não é a atual é tocável — voltar aos valores é um toque, não uma
 * sequência de "Voltar".
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

interface Props {
  atual: 1 | 2;
  onIrPara?: (etapa: 1 | 2) => void;
}

const ETAPAS: { n: 1 | 2; titulo: string }[] = [
  { n: 1, titulo: 'Valores' },
  { n: 2, titulo: 'Unidade e cliente' },
];

export function EtapasSimulador({ atual, onIrPara }: Props) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.linha} accessibilityRole="tablist">
      {ETAPAS.map((e, i) => {
        const ativa = e.n === atual;
        const feita = e.n < atual;
        return (
          <View key={e.n} style={styles.item}>
            {i > 0 ? <View style={[styles.traco, (ativa || feita) && styles.tracoAtivo]} /> : null}
            <Pressable
              onPress={() => onIrPara?.(e.n)}
              disabled={ativa || !onIrPara}
              style={styles.passo}
              accessibilityRole="tab"
              accessibilityState={{ selected: ativa }}
              hitSlop={6}
            >
              <View style={[styles.bolinha, ativa && styles.bolinhaAtiva, feita && styles.bolinhaFeita]}>
                <Text style={[styles.numero, ativa && styles.numeroAtivo, feita && styles.numeroFeito]}>
                  {feita ? '✓' : e.n}
                </Text>
              </View>
              <Text style={[styles.titulo, ativa && styles.tituloAtivo]}>{e.titulo}</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    linha: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
    item: { flexDirection: 'row', alignItems: 'center' },
    traco: { width: 28, height: 2, backgroundColor: colors.border, marginHorizontal: spacing.sm },
    tracoAtivo: { backgroundColor: colors.primary },
    passo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    bolinha: {
      width: 24,
      height: 24,
      borderRadius: radius.pill,
      borderWidth: 1.5,
      borderColor: colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bolinhaAtiva: { backgroundColor: colors.primary, borderColor: colors.primary },
    bolinhaFeita: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
    numero: { ...typography.caption, fontWeight: '700', color: colors.inkMuted },
    numeroAtivo: { color: colors.white },
    // O ✓ sobre o fundo claro da etapa feita: branco ali ficaria invisível.
    numeroFeito: { color: colors.primary },
    titulo: { ...typography.label, color: colors.inkMuted },
    tituloAtivo: { color: colors.ink },
  });
