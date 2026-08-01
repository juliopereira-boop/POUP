import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';

import { formatCompactBRL } from './format';
import { radius, spacing, typography, type AppColors } from '@/theme';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';

export interface BarChartDatum {
  label: string;
  value: number;
}

interface BarChartProps {
  data: BarChartDatum[];
  /** Altura total do gráfico (barras + rótulos). Padrão 180. */
  height?: number;
  formatValue?: (n: number) => string;
}

/** Espaço reservado no topo para o valor da maior barra. */
const VALUE_ROW = 20;
/** Espaço reservado embaixo para o rótulo do mês. */
const LABEL_ROW = 18;
/** Largura mínima de cada mês quando a série rola na horizontal. */
const SCROLL_SLOT = 46;
/** Acima disso a série passa a rolar em vez de comprimir os rótulos. */
const SCROLL_THRESHOLD = 8;
const MIN_BAR = 2;
/** Altura do traço que marca um mês sem venda (senão a barra desaparece). */
const ZERO_TRACK = 3;

/**
 * Barras verticais para a série mensal de VGV.
 *
 * Muitos meses (12+): o gráfico passa a ROLAR na horizontal a partir de 9
 * pontos, com slot fixo de 46px por mês. Preferi rolagem a esconder rótulos
 * alternados porque o corretor precisa ler o mês exato de cada barra — com
 * "jan / — / mar" ele erra a leitura; rolando, todos os meses ficam legíveis e
 * a comparação de altura continua honesta (uma escala só para toda a série).
 */
export function BarChart({ data, height = 180, formatValue }: BarChartProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const [available, setAvailable] = useState(0);

  const onLayout = (event: LayoutChangeEvent) => {
    const width = Math.round(event.nativeEvent.layout.width);
    if (width > 0 && width !== available) setAvailable(width);
  };

  const format = formatValue ?? formatCompactBRL;
  const scrolls = data.length > SCROLL_THRESHOLD;
  const fallbackWidth = Math.max(data.length, 1) * SCROLL_SLOT;
  const boxWidth = available > 0 ? available : fallbackWidth;
  const chartWidth = scrolls ? Math.max(boxWidth, fallbackWidth) : boxWidth;
  const slot = data.length > 0 ? chartWidth / data.length : chartWidth;
  const barWidth = Math.max(6, Math.min(40, slot * 0.58));

  const plotTop = VALUE_ROW;
  const plotHeight = Math.max(24, height - VALUE_ROW - LABEL_ROW);
  const baseline = plotTop + plotHeight;

  let maxValue = 0;
  let maxIndex = 0;
  data.forEach((item, index) => {
    const value = Number.isFinite(item.value) ? item.value : 0;
    if (value > maxValue) {
      maxValue = value;
      maxIndex = index;
    }
  });

  if (data.length === 0) {
    return (
      <View style={[styles.empty, { minHeight: height }]} onLayout={onLayout}>
        <Text style={styles.emptyText}>Sem vendas no período.</Text>
      </View>
    );
  }

  const chart = (
    <Svg width={chartWidth} height={height}>
      {/* Teto da escala: dá referência de leitura mesmo com a série rolada. */}
      {maxValue > 0 ? (
        <Line
          x1={0}
          y1={plotTop + 0.5}
          x2={chartWidth}
          y2={plotTop + 0.5}
          stroke={colors.border}
          strokeWidth={1}
          strokeDasharray="3 4"
        />
      ) : null}
      <Line
        x1={0}
        y1={baseline + 0.5}
        x2={chartWidth}
        y2={baseline + 0.5}
        stroke={colors.border}
        strokeWidth={1}
      />
      {data.map((item, index) => {
        const value = Number.isFinite(item.value) && item.value > 0 ? item.value : 0;
        const ratio = maxValue > 0 ? value / maxValue : 0;
        const barHeight = value > 0 ? Math.max(MIN_BAR, ratio * plotHeight) : ZERO_TRACK;
        const isMax = index === maxIndex && maxValue > 0;
        return (
          <Rect
            key={`bar-${item.label}-${index}`}
            x={index * slot + (slot - barWidth) / 2}
            y={baseline - barHeight}
            width={barWidth}
            height={barHeight}
            rx={Math.min(4, barWidth / 2)}
            fill={value > 0 ? colors.primary : colors.borderStrong}
            fillOpacity={value > 0 && !isMax ? 0.72 : 1}
          />
        );
      })}
      {maxValue > 0 ? (
        <SvgText
          x={Math.min(Math.max(maxIndex * slot + slot / 2, 32), Math.max(chartWidth - 32, 32))}
          y={plotTop - 6}
          fill={colors.ink}
          fontSize={11}
          fontWeight="600"
          textAnchor="middle"
        >
          {format(maxValue)}
        </SvgText>
      ) : null}
      {maxValue === 0 ? (
        <SvgText
          x={chartWidth / 2}
          y={plotTop + plotHeight / 2}
          fill={colors.inkSubtle}
          fontSize={12}
          textAnchor="middle"
        >
          Nenhum valor no período
        </SvgText>
      ) : null}
      {data.map((item, index) => (
        <SvgText
          key={`label-${item.label}-${index}`}
          x={index * slot + slot / 2}
          y={height - 5}
          fill={colors.inkMuted}
          fontSize={10}
          textAnchor="middle"
        >
          {item.label}
        </SvgText>
      ))}
    </Svg>
  );

  return (
    <View onLayout={onLayout} style={styles.wrapper}>
      {scrolls ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {chart}
        </ScrollView>
      ) : (
        chart
      )}
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    wrapper: { width: '100%' },
    scrollContent: { paddingRight: spacing.xs },
    empty: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
    },
    emptyText: { ...typography.caption, color: colors.inkSubtle, textAlign: 'center' },
  });
