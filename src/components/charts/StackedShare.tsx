import { StyleSheet, Text, View } from 'react-native';

import { abbreviateBRL, formatPercent } from './format';
import { radius, spacing, typography, type AppColors } from '@/theme';
import { useThemedStyles } from '@/providers/ThemeProvider';

export interface ShareDatum {
  label: string;
  value: number;
  /** Cor da fatia — única cor que vem de fora (a tela decide a paleta). */
  color: string;
}

interface StackedShareProps {
  data: ShareDatum[];
  formatValue?: (n: number) => string;
}

/**
 * Barra única empilhada com a composição (ex.: financiamento / subsídio / FGTS
 * / recursos próprios) e legenda embaixo com cor, rótulo, valor e percentual.
 */
export function StackedShare({ data, formatValue }: StackedShareProps) {
  const styles = useThemedStyles(makeStyles);

  const format = formatValue ?? abbreviateBRL;
  const items = data.map((item) => ({
    ...item,
    value: Number.isFinite(item.value) && item.value > 0 ? item.value : 0,
  }));
  const total = items.reduce((acc, item) => acc + item.value, 0);

  if (items.length === 0 || total <= 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Sem composição de pagamento informada.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.bar}>
        {items.map((item, index) =>
          item.value > 0 ? (
            <View
              key={`seg-${item.label}-${index}`}
              style={{ flexGrow: item.value, flexShrink: 1, backgroundColor: item.color }}
            />
          ) : null,
        )}
      </View>

      <View style={styles.legend}>
        {items.map((item, index) => (
          <View key={`leg-${item.label}-${index}`} style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: item.color }]} />
            <Text style={styles.legendLabel} numberOfLines={1}>
              {item.label}
            </Text>
            <Text style={styles.legendValue} numberOfLines={1}>
              {format(item.value)}
            </Text>
            <Text style={styles.legendPct} numberOfLines={1}>
              {formatPercent((item.value / total) * 100)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    wrapper: { width: '100%', gap: spacing.md },
    bar: {
      flexDirection: 'row',
      height: 16,
      width: '100%',
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    legend: { gap: spacing.sm },
    legendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    dot: { width: 10, height: 10, borderRadius: radius.pill },
    legendLabel: { ...typography.caption, color: colors.inkMuted, flex: 1 },
    legendValue: { ...typography.caption, fontWeight: '600', color: colors.ink },
    legendPct: {
      ...typography.caption,
      color: colors.inkSubtle,
      minWidth: 46,
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
