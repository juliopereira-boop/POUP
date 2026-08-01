import { StyleSheet, Text, View } from 'react-native';

import type { SaleStatus } from '@/data';
import { radius, spacing, typography, type AppColors } from '@/theme';
import { useThemedStyles } from '@/providers/ThemeProvider';

interface SaleStatusPillProps {
  status: SaleStatus;
}

/** Selo de situação da venda: verde para ativa, vermelho para distratada. */
export function SaleStatusPill({ status }: SaleStatusPillProps) {
  const styles = useThemedStyles(makeStyles);
  const distratada = status === 'distratada';

  return (
    <View style={[styles.pill, distratada ? styles.pillBad : styles.pillOk]}>
      <Text style={[styles.text, distratada ? styles.textBad : styles.textOk]}>
        {distratada ? 'Distratada' : 'Ativa'}
      </Text>
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    pill: {
      alignSelf: 'flex-start',
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    pillOk: { backgroundColor: colors.successSoft },
    pillBad: { backgroundColor: colors.dangerSoft },
    text: { ...typography.caption, fontWeight: '700' },
    textOk: { color: colors.success },
    textBad: { color: colors.danger },
  });
