import { StyleSheet, Text, View } from 'react-native';

import { abbreviateBRL } from './format';
import { radius, spacing, typography, type AppColors } from '@/theme';
import { useThemedStyles } from '@/providers/ThemeProvider';

export interface RankingDatum {
  label: string;
  value: number;
  /** Linha auxiliar sob o nome, ex.: `3 vendas`. */
  caption?: string;
}

interface RankingBarsProps {
  data: RankingDatum[];
  /** Escala máxima. Padrão: o maior valor da lista. */
  max?: number;
  formatValue?: (n: number) => string;
}

/** Largura mínima para uma barra com valor > 0 não desaparecer. */
const MIN_FILL_PCT = 3;

/**
 * Ranking em barras horizontais: nome à esquerda, barra proporcional no meio,
 * valor à direita. Nomes longos são truncados com `numberOfLines={1}`.
 */
export function RankingBars({ data, max, formatValue }: RankingBarsProps) {
  const styles = useThemedStyles(makeStyles);

  if (data.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Nada para ranquear no período.</Text>
      </View>
    );
  }

  const format = formatValue ?? abbreviateBRL;

  const values = data.map((item) => (Number.isFinite(item.value) ? item.value : 0));
  const providedMax = typeof max === 'number' && Number.isFinite(max) ? max : 0;
  const scale = Math.max(providedMax, ...values, 0);

  return (
    <View style={styles.wrapper}>
      {data.map((item, index) => {
        const value = values[index];
        const raw = scale > 0 && value > 0 ? (value / scale) * 100 : 0;
        const pct = value > 0 ? Math.max(MIN_FILL_PCT, Math.min(100, raw)) : 0;
        return (
          <View key={`${item.label}-${index}`} style={styles.row}>
            <View style={styles.nameCol}>
              <Text style={styles.name} numberOfLines={1}>
                {item.label}
              </Text>
              {item.caption ? (
                <Text style={styles.caption} numberOfLines={1}>
                  {item.caption}
                </Text>
              ) : null}
            </View>
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  { width: `${pct}%`, opacity: index === 0 ? 1 : 0.72 },
                ]}
              />
            </View>
            <Text style={styles.value} numberOfLines={1}>
              {format(value)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    wrapper: { width: '100%', gap: spacing.md },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    nameCol: { width: '38%', minWidth: 84, maxWidth: 260 },
    name: { ...typography.caption, fontWeight: '600', color: colors.ink },
    caption: { fontSize: 11, lineHeight: 14, color: colors.inkSubtle },
    track: {
      flex: 1,
      height: 10,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      justifyContent: 'center',
    },
    fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.primary },
    value: {
      ...typography.caption,
      fontWeight: '600',
      color: colors.ink,
      minWidth: 74,
      textAlign: 'right',
    },
    empty: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: spacing.xl,
      paddingHorizontal: spacing.lg,
    },
    emptyText: { ...typography.caption, color: colors.inkSubtle, textAlign: 'center' },
  });
