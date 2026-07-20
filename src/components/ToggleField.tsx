import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, typography, type AppColors } from '@/theme';
import { useThemedStyles } from '@/providers/ThemeProvider';

interface ToggleFieldProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  /** Legendas para ligado/desligado. */
  onLabel?: string;
  offLabel?: string;
}

/**
 * Interruptor com legenda (Sim/Não): verde quando ligado, vermelho quando
 * desligado. A legenda mostra o estado atual ao lado.
 */
export function ToggleField({
  label,
  value,
  onChange,
  onLabel = 'Sim',
  offLabel = 'Não',
}: ToggleFieldProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => onChange(!value)}
        accessibilityRole="switch"
        accessibilityState={{ checked: value }}
        style={styles.control}
      >
        <Text style={[styles.legend, value ? styles.legendOn : styles.legendOff]}>
          {value ? onLabel : offLabel}
        </Text>
        <View style={[styles.track, value ? styles.trackOn : styles.trackOff]}>
          <View style={[styles.thumb, value ? styles.thumbOn : styles.thumbOff]} />
        </View>
      </Pressable>
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.md,
      gap: spacing.md,
    },
    label: { ...typography.body, color: colors.ink, flex: 1 },
    control: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    legend: { ...typography.label },
    legendOn: { color: colors.success },
    legendOff: { color: colors.danger },
    track: {
      width: 48,
      height: 28,
      borderRadius: radius.pill,
      padding: 3,
      justifyContent: 'center',
    },
    trackOn: { backgroundColor: colors.success },
    trackOff: { backgroundColor: colors.danger },
    thumb: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.white,
    },
    thumbOn: { alignSelf: 'flex-end' },
    thumbOff: { alignSelf: 'flex-start' },
  });
