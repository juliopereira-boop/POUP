/**
 * AS UNIDADES DE UM BLOCO, DESENHADAS COMO O PRÉDIO.
 *
 * O último andar em cima e o térreo embaixo, porque é assim que o corretor e o
 * cliente pensam no apartamento ("o de cima, do lado da piscina"). Cada
 * unidade mostra o código, o preço e a vaga; a bolinha verde marca a mais
 * ventilada. Unidade sem preço aparece apagada — e, quando há `onEscolher`,
 * não pode ser escolhida: o simulador só preenche o que a tabela sabe.
 *
 * Serve o simulador (para escolher) e a tela da tabela (para conferir).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { UnidadeComPreco } from '@/features/tabelaPreco/useUnidadesComPreco';
import type { Vaga } from '@/features/tabelaPreco/preco';
import { rotuloDoPavimento } from '@/features/unidades/gerador';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

/** "R$ 244.780" → "244,8 mil". Cabe numa célula de celular. */
export function precoCurto(v: number): string {
  if (v >= 1_000_000) {
    return `${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`;
  }
  return `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
}

interface Props {
  unidades: UnidadeComPreco[];
  selecionadaId?: string | null;
  onEscolher?: (u: UnidadeComPreco) => void;
  /** Mostra só as unidades com esta vaga. */
  filtroVaga?: Vaga | null;
}

export function GradeDeUnidades({ unidades, selecionadaId, onEscolher, filtroVaga = null }: Props) {
  const styles = useThemedStyles(makeStyles);

  const porAndar = new Map<number, UnidadeComPreco[]>();
  for (const u of unidades) {
    if (filtroVaga && u.vaga !== filtroVaga) continue;
    porAndar.set(u.pavimento, [...(porAndar.get(u.pavimento) ?? []), u]);
  }
  const andares = [...porAndar.keys()].sort((a, b) => b - a);

  if (andares.length === 0) {
    return (
      <Text style={styles.vazio}>
        {filtroVaga ? `Nenhuma unidade com vaga de ${filtroVaga} neste bloco.` : 'Este bloco não tem unidades.'}
      </Text>
    );
  }

  return (
    <View style={styles.grade}>
      {andares.map((andar) => (
        <View key={andar} style={styles.andar}>
          <Text style={styles.rotuloAndar} numberOfLines={1}>
            {rotuloDoPavimento(andar)}
          </Text>
          <View style={styles.celulas}>
            {porAndar.get(andar)!.map((u) => {
              const temPreco = u.valorDeVenda != null;
              const escolhida = u.id === selecionadaId;
              const podeTocar = Boolean(onEscolher) && temPreco;
              return (
                <Pressable
                  key={u.id}
                  onPress={podeTocar ? () => onEscolher?.(u) : undefined}
                  disabled={!podeTocar}
                  accessibilityRole={onEscolher ? 'button' : undefined}
                  accessibilityState={{ selected: escolhida, disabled: !podeTocar }}
                  accessibilityLabel={`Unidade ${u.codigo}${temPreco ? `, ${precoCurto(u.valorDeVenda!)}` : ', sem preço'}${u.vaga ? `, vaga de ${u.vaga}` : ''}${u.ventilacao ? `, ${u.ventilacao} ventilada` : ''}`}
                  style={({ pressed }) => [
                    styles.celula,
                    !temPreco && styles.celulaSemPreco,
                    escolhida && styles.celulaEscolhida,
                    pressed && podeTocar && styles.celulaPressionada,
                  ]}
                >
                  {u.ventilacao === 'mais' ? <View style={styles.bolinha} /> : null}
                  <Text style={[styles.codigo, escolhida && styles.textoEscolhido]}>{u.codigo}</Text>
                  <Text style={[styles.preco, !temPreco && styles.precoAusente, escolhida && styles.textoEscolhido]}>
                    {temPreco ? precoCurto(u.valorDeVenda!) : 'sem preço'}
                  </Text>
                  <Text style={[styles.vaga, escolhida && styles.textoEscolhido]}>{u.vaga ?? '—'}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      <View style={styles.legenda}>
        <View style={styles.bolinhaLegenda} />
        <Text style={styles.legendaTexto}>mais ventilado · preço em reais</Text>
      </View>
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    grade: { gap: spacing.sm },
    vazio: { ...typography.caption, color: colors.inkSubtle, paddingVertical: spacing.md },
    // O nome do andar em cima, e não ao lado: assim os 4 apartamentos de um
    // andar cabem numa linha só num celular estreito.
    andar: { gap: 4 },
    rotuloAndar: { ...typography.caption, fontWeight: '600', color: colors.inkMuted },
    celulas: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    celula: {
      flexGrow: 1,
      flexBasis: 60,
      maxWidth: 140,
      minHeight: 60,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingVertical: 6,
      paddingHorizontal: 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    celulaSemPreco: { backgroundColor: colors.surfaceAlt, borderStyle: 'dashed' },
    celulaEscolhida: { backgroundColor: colors.primary, borderColor: colors.primary },
    celulaPressionada: { opacity: 0.7 },
    bolinha: {
      position: 'absolute',
      top: 5,
      right: 5,
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.success,
    },
    codigo: { fontSize: 15, lineHeight: 19, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
    preco: { fontSize: 12, lineHeight: 15, fontWeight: '600', color: colors.primary, fontVariant: ['tabular-nums'] },
    precoAusente: { color: colors.inkSubtle, fontWeight: '400' },
    vaga: { fontSize: 10, lineHeight: 13, color: colors.inkSubtle },
    textoEscolhido: { color: colors.white },
    legenda: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
    bolinhaLegenda: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
    legendaTexto: { ...typography.caption, fontSize: 11, color: colors.inkSubtle },
  });
