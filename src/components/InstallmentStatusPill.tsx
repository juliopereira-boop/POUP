import { StyleSheet, Text, View } from 'react-native';

import type { CommissionInstallmentStatus, InvoiceStatus } from '@/data';
import { radius, spacing, typography, type AppColors } from '@/theme';
import { useThemedStyles } from '@/providers/ThemeProvider';

interface InstallmentStatusPillProps {
  status: CommissionInstallmentStatus;
  /**
   * `true` quando a parcela pendente já venceu. Vira "Atrasada" em vermelho —
   * atraso não é um status gravado no banco, é leitura de hoje contra o
   * vencimento (`isInstallmentLate`).
   */
  late?: boolean;
}

/**
 * Selo de situação da parcela de comissão, com o mesmo código de cor nas duas
 * telas do módulo: pendente em âmbar, atrasada em vermelho, recebida em verde,
 * cancelada apagada.
 */
export function InstallmentStatusPill({ status, late = false }: InstallmentStatusPillProps) {
  const styles = useThemedStyles(makeStyles);

  const tone =
    status === 'recebida' ? 'ok' : status === 'cancelada' ? 'off' : late ? 'bad' : 'warn';

  const label =
    status === 'recebida'
      ? 'Recebida'
      : status === 'cancelada'
        ? 'Cancelada'
        : late
          ? 'Atrasada'
          : 'Pendente';

  return (
    <View
      style={[
        styles.pill,
        tone === 'ok' && styles.pillOk,
        tone === 'bad' && styles.pillBad,
        tone === 'warn' && styles.pillWarn,
        tone === 'off' && styles.pillOff,
      ]}
    >
      <Text
        style={[
          styles.text,
          tone === 'ok' && styles.textOk,
          tone === 'bad' && styles.textBad,
          tone === 'warn' && styles.textWarn,
          tone === 'off' && styles.textOff,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

interface InvoiceStatusChipProps {
  status: InvoiceStatus;
  invoiceNumber?: string | null;
}

/** Situação da nota fiscal da parcela, em uma linha curta. */
export function InvoiceStatusChip({ status, invoiceNumber }: InvoiceStatusChipProps) {
  const styles = useThemedStyles(makeStyles);

  if (status === 'nao_emitida') {
    return <Text style={styles.nfMuted}>Nota fiscal não emitida</Text>;
  }
  if (status === 'cancelada') {
    return (
      <Text style={styles.nfBad}>
        Nota fiscal cancelada{invoiceNumber ? ` · nº ${invoiceNumber}` : ''}
      </Text>
    );
  }
  return (
    <Text style={styles.nfOk}>
      Nota fiscal emitida{invoiceNumber ? ` · nº ${invoiceNumber}` : ''}
    </Text>
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
    pillWarn: { backgroundColor: colors.warningSoft },
    pillOff: { backgroundColor: colors.surfaceAlt },
    text: { ...typography.caption, fontWeight: '700', fontSize: 12 },
    textOk: { color: colors.success },
    textBad: { color: colors.danger },
    textWarn: { color: colors.warning },
    textOff: { color: colors.inkSubtle },

    nfOk: { ...typography.caption, color: colors.success, fontSize: 12 },
    nfBad: { ...typography.caption, color: colors.danger, fontSize: 12 },
    nfMuted: { ...typography.caption, color: colors.inkSubtle, fontSize: 12 },
  });
