/**
 * AS UNIDADES DE UM BLOCO, DESENHADAS COMO O PRÉDIO.
 *
 * O último andar em cima e o térreo embaixo, porque é assim que o corretor e o
 * cliente pensam no apartamento ("o de cima, do lado da piscina"). Cada
 * unidade mostra o código, o preço e a vaga; a bolinha AZUL marca a mais
 * ventilada. Unidade sem preço aparece apagada — e, quando há `onEscolher`,
 * não pode ser escolhida: o simulador só preenche o que a tabela sabe.
 *
 * COM O CV (empreendimento vinculado ao CV CRM), cada unidade ganha a cor da
 * situação no CV, ao vivo:
 *     verde    disponível
 *     amarelo  em negociação (reservada)
 *     vermelho vendida                     — não pode ser escolhida
 *     cinza    fora de venda (bloqueada)   — não pode ser escolhida
 * A situação também vai por escrito na célula e no leitor de tela: a cor
 * sozinha não basta (daltonismo). Sem CV, a grade fica exatamente como era.
 *
 * Serve o simulador (para escolher) e a tela da tabela (para conferir).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { UnidadeComPreco } from '@/features/tabelaPreco/useUnidadesComPreco';
import type { Vaga } from '@/features/tabelaPreco/preco';
import { haQuanto, podeEscolher, rotuloDaSituacao } from '@/features/disponibilidade/aplicar';
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

/** O frescor da leitura do CV, para a legenda. `null` = sem CV. */
export interface AoVivo {
  atualizadoEm: string | null;
  desatualizada: boolean;
  agora: number;
}

interface Props {
  unidades: UnidadeComPreco[];
  selecionadaId?: string | null;
  onEscolher?: (u: UnidadeComPreco) => void;
  /** Mostra só as unidades com esta vaga. */
  filtroVaga?: Vaga | null;
  /** Empreendimento com CV: a legenda ganha as cores e o "atualizado há…". */
  aoVivo?: AoVivo | null;
}

export function GradeDeUnidades({ unidades, selecionadaId, onEscolher, filtroVaga = null, aoVivo = null }: Props) {
  const styles = useThemedStyles(makeStyles);

  const porAndar = new Map<number, UnidadeComPreco[]>();
  for (const u of unidades) {
    if (filtroVaga && u.vaga !== filtroVaga) continue;
    porAndar.set(u.pavimento, [...(porAndar.get(u.pavimento) ?? []), u]);
  }
  const andares = [...porAndar.keys()].sort((a, b) => b - a);
  const comCores = Boolean(aoVivo) || unidades.some((u) => u.situacao);

  if (andares.length === 0) {
    return (
      <Text style={styles.vazio}>
        {filtroVaga ? `Nenhuma unidade com vaga de ${filtroVaga} neste bloco.` : 'Este bloco não tem unidades.'}
      </Text>
    );
  }

  const estiloDaSituacao = (u: UnidadeComPreco) =>
    u.situacao === 'disponivel'
      ? styles.celulaDisponivel
      : u.situacao === 'negociacao'
        ? styles.celulaNegociacao
        : u.situacao === 'vendida'
          ? styles.celulaVendida
          : u.situacao === 'indisponivel'
            ? styles.celulaIndisponivel
            : null;

  const atualizado = aoVivo ? haQuanto(aoVivo.atualizadoEm, aoVivo.agora) : null;

  return (
    <View style={styles.grade}>
      {aoVivo?.desatualizada ? (
        <Text style={styles.aviso}>
          A disponibilidade pode estar desatualizada{atualizado ? ` (última leitura ${atualizado})` : ''}. Confira antes
          de fechar.
        </Text>
      ) : null}
      {andares.map((andar) => (
        <View key={andar} style={styles.andar}>
          <Text style={styles.rotuloAndar} numberOfLines={1}>
            {rotuloDoPavimento(andar)}
          </Text>
          <View style={styles.celulas}>
            {porAndar.get(andar)!.map((u) => {
              const temPreco = u.valorDeVenda != null;
              const escolhida = u.id === selecionadaId;
              const livre = podeEscolher(u.situacao);
              const podeTocar = Boolean(onEscolher) && temPreco && livre;
              const situacao = rotuloDaSituacao(u.situacao, u.statusDescricao);
              return (
                <Pressable
                  key={u.id}
                  onPress={podeTocar ? () => onEscolher?.(u) : undefined}
                  disabled={!podeTocar}
                  accessibilityRole={onEscolher ? 'button' : undefined}
                  accessibilityState={{ selected: escolhida, disabled: !podeTocar }}
                  accessibilityLabel={`Unidade ${u.codigo}${situacao ? `, ${situacao}` : ''}${temPreco ? `, ${precoCurto(u.valorDeVenda!)}` : ', sem preço'}${u.vaga ? `, vaga de ${u.vaga}` : ''}${u.ventilacao ? `, ${u.ventilacao} ventilada` : ''}`}
                  style={({ pressed }) => [
                    styles.celula,
                    comCores && styles.celulaComCor,
                    !temPreco && styles.celulaSemPreco,
                    estiloDaSituacao(u),
                    escolhida && styles.celulaEscolhida,
                    pressed && podeTocar && styles.celulaPressionada,
                  ]}
                >
                  {u.ventilacao === 'mais' ? <View style={styles.bolinha} /> : null}
                  <Text
                    style={[styles.codigo, !livre && styles.textoApagado, escolhida && styles.textoEscolhido]}
                  >
                    {u.codigo}
                  </Text>
                  <Text
                    style={[
                      styles.preco,
                      (!temPreco || !livre) && styles.precoAusente,
                      escolhida && styles.textoEscolhido,
                    ]}
                  >
                    {temPreco ? precoCurto(u.valorDeVenda!) : 'sem preço'}
                  </Text>
                  <Text style={[styles.vaga, escolhida && styles.textoEscolhido]}>{u.vaga ?? '—'}</Text>
                  {situacao ? (
                    <Text
                      style={[styles.situacao, escolhida && styles.textoEscolhido]}
                      numberOfLines={1}
                    >
                      {situacao}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      <View style={styles.legenda}>
        <View style={styles.itemLegenda}>
          <View style={styles.bolinhaLegenda} />
          <Text style={styles.legendaTexto}>mais ventilado · preço em reais</Text>
        </View>
        {comCores ? (
          <>
            <View style={styles.itemLegenda}>
              <View style={[styles.quadrado, styles.celulaDisponivel]} />
              <Text style={styles.legendaTexto}>disponível</Text>
            </View>
            <View style={styles.itemLegenda}>
              <View style={[styles.quadrado, styles.celulaNegociacao]} />
              <Text style={styles.legendaTexto}>em negociação</Text>
            </View>
            <View style={styles.itemLegenda}>
              <View style={[styles.quadrado, styles.celulaVendida]} />
              <Text style={styles.legendaTexto}>vendida</Text>
            </View>
            <View style={styles.itemLegenda}>
              <View style={[styles.quadrado, styles.celulaIndisponivel]} />
              <Text style={styles.legendaTexto}>fora de venda</Text>
            </View>
          </>
        ) : null}
      </View>
      {aoVivo && atualizado && !aoVivo.desatualizada ? (
        <Text style={styles.legendaTexto}>Disponibilidade do CV, atualizada {atualizado}.</Text>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    grade: { gap: spacing.sm },
    vazio: { ...typography.caption, color: colors.inkSubtle, paddingVertical: spacing.md },
    aviso: {
      ...typography.caption,
      color: colors.ink,
      backgroundColor: colors.warningSoft,
      borderColor: colors.warning,
      borderWidth: 1,
      borderRadius: radius.sm,
      padding: spacing.sm,
      overflow: 'hidden',
    },
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
    celulaComCor: { minHeight: 72, borderWidth: 1.5 },
    celulaSemPreco: { backgroundColor: colors.surfaceAlt, borderStyle: 'dashed' },
    celulaDisponivel: { backgroundColor: colors.successSoft, borderColor: colors.success, borderStyle: 'solid' },
    celulaNegociacao: { backgroundColor: colors.warningSoft, borderColor: colors.warning, borderStyle: 'solid' },
    celulaVendida: { backgroundColor: colors.dangerSoft, borderColor: colors.danger, borderStyle: 'solid' },
    celulaIndisponivel: { backgroundColor: colors.surfaceAlt, borderColor: colors.borderStrong, borderStyle: 'solid' },
    // A escolhida vence a cor da situação.
    celulaEscolhida: { backgroundColor: colors.primary, borderColor: colors.primary },
    celulaPressionada: { opacity: 0.7 },
    bolinha: {
      position: 'absolute',
      top: 5,
      right: 5,
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.info,
    },
    codigo: { fontSize: 15, lineHeight: 19, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
    preco: { fontSize: 12, lineHeight: 15, fontWeight: '600', color: colors.primary, fontVariant: ['tabular-nums'] },
    precoAusente: { color: colors.inkSubtle, fontWeight: '400' },
    textoApagado: { color: colors.inkMuted },
    vaga: { fontSize: 10, lineHeight: 13, color: colors.inkSubtle },
    situacao: { fontSize: 9, lineHeight: 12, fontWeight: '700', color: colors.ink, textTransform: 'uppercase' },
    textoEscolhido: { color: colors.white },
    legenda: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.md, rowGap: 4, marginTop: spacing.xs },
    itemLegenda: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    bolinhaLegenda: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.info },
    quadrado: { width: 12, height: 12, borderRadius: 3, borderWidth: 1.5 },
    legendaTexto: { ...typography.caption, fontSize: 11, color: colors.inkSubtle },
  });
