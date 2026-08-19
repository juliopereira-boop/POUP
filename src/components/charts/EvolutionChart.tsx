import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';

import { abbreviateBRL } from './format';
import { radius, spacing, typography, type AppColors } from '@/theme';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';

export interface SerieEvolucao {
  label: string;
  color: string;
  /** Um ponto por mês. Pode ter centenas — a amostragem é feita aqui dentro. */
  values: number[];
}

interface Props {
  series: SerieEvolucao[];
  height?: number;
  /** Rótulo do eixo horizontal nas pontas. Ex.: 'mês 1' / 'mês 420'. */
  legendaInicio?: string;
  legendaFim?: string;
  formatValue?: (n: number) => string;
}

/**
 * A EVOLUÇÃO DE UMA SÉRIE LONGA — parcela e saldo devedor.
 *
 * ===========================================================================
 * POR QUE AMOSTRAR, E POR QUE NÃO NO MEIO
 * ===========================================================================
 * Um financiamento de 35 anos tem 420 pontos. Desenhar 420 segmentos num
 * gráfico de 300 pixels de largura é gastar bateria para produzir uma linha
 * idêntica à de 120 pontos — só que com meio segundo de espera no celular do
 * corretor.
 *
 * A amostragem pega no máximo `MAX_PONTOS` posições espaçadas igualmente, mas
 * **o primeiro e o último ponto são sempre incluídos, exatos**. Numa curva de
 * amortização são justamente eles que o corretor lê em voz alta ("começa em X
 * e termina em Y"), e um valor "quase" ali seria pior do que não ter gráfico.
 *
 * ===========================================================================
 * A ESCALA COMEÇA EM ZERO
 * ===========================================================================
 * De propósito, e é decisão de honestidade. Numa curva SAC que cai de R$ 2.400
 * para R$ 1.100, uma escala que começasse em R$ 1.000 faria a queda parecer
 * dramática — a mesma queda com base zero parece o que é. Gráfico de venda com
 * eixo truncado é gráfico que engana o cliente.
 */
const MAX_PONTOS = 96;
const PAD_TOPO = 12;
const PAD_BASE = 22;
const PAD_ESQ = 8;
const PAD_DIR = 8;

function amostrar(valores: number[], max: number): number[] {
  if (valores.length <= max) return valores;
  const saida: number[] = [];
  const passo = (valores.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) {
    saida.push(valores[Math.round(i * passo)]!);
  }
  // Garante a ponta exata mesmo com arredondamento do passo.
  saida[saida.length - 1] = valores[valores.length - 1]!;
  return saida;
}

export function EvolutionChart({
  series,
  height = 190,
  legendaInicio,
  legendaFim,
  formatValue,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [largura, setLargura] = useState(0);

  const format = formatValue ?? abbreviateBRL;
  const amostradas = series.map((s) => ({ ...s, values: amostrar(s.values, MAX_PONTOS) }));
  const todos = amostradas.flatMap((s) => s.values).filter((n) => Number.isFinite(n));

  function medir(e: LayoutChangeEvent) {
    setLargura(e.nativeEvent.layout.width);
  }

  if (todos.length === 0) {
    return (
      <View style={styles.vazio} onLayout={medir}>
        <Text style={styles.vazioTexto}>Sem dados para o gráfico.</Text>
      </View>
    );
  }

  const maximo = Math.max(...todos, 1);
  const alturaPlot = height - PAD_TOPO - PAD_BASE;
  const larguraPlot = Math.max(largura - PAD_ESQ - PAD_DIR, 1);

  function caminho(valores: number[]): string {
    if (valores.length === 0) return '';
    const passo = valores.length > 1 ? larguraPlot / (valores.length - 1) : 0;
    return valores
      .map((v, i) => {
        const x = PAD_ESQ + i * passo;
        const y = PAD_TOPO + alturaPlot * (1 - Math.max(v, 0) / maximo);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }

  return (
    <View onLayout={medir}>
      {largura > 0 ? (
        <Svg width={largura} height={height}>
          {/* três linhas de grade: topo, meio e base. Mais que isso vira ruído. */}
          {[0, 0.5, 1].map((f) => {
            const y = PAD_TOPO + alturaPlot * f;
            return (
              <Line
                key={f}
                x1={PAD_ESQ}
                y1={y}
                x2={largura - PAD_DIR}
                y2={y}
                stroke={colors.border}
                strokeWidth={1}
              />
            );
          })}
          <SvgText x={PAD_ESQ} y={PAD_TOPO - 2} fill={colors.inkSubtle} fontSize={10}>
            {format(maximo)}
          </SvgText>

          {amostradas.map((s) => (
            <Path
              key={s.label}
              d={caminho(s.values)}
              stroke={s.color}
              strokeWidth={2.2}
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
        </Svg>
      ) : (
        <View style={{ height }} />
      )}

      <View style={styles.eixo}>
        <Text style={styles.eixoTexto}>{legendaInicio ?? ''}</Text>
        <Text style={styles.eixoTexto}>{legendaFim ?? ''}</Text>
      </View>

      <View style={styles.legenda}>
        {series.map((s) => (
          <View key={s.label} style={styles.legendaItem}>
            <View style={[styles.bolinha, { backgroundColor: s.color }]} />
            <Text style={styles.legendaTexto}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    vazio: {
      padding: spacing.lg,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
    },
    vazioTexto: { ...typography.caption, color: colors.inkMuted },
    eixo: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
    eixoTexto: { ...typography.caption, color: colors.inkSubtle, fontSize: 11 },
    legenda: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
    legendaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    bolinha: { width: 9, height: 9, borderRadius: 5 },
    legendaTexto: { ...typography.caption, color: colors.inkMuted },
  });
