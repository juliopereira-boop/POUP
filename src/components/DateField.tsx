import { createElement, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

import { radius, spacing, typography, type AppColors } from '@/theme';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';

interface DateFieldProps {
  label?: string;
  /** Data em ISO (yyyy-mm-dd) ou null. */
  value: string | null;
  onChange: (iso: string) => void;
  placeholder?: string;
  /** Somente leitura: mostra a data mas não abre o seletor. */
  readOnly?: boolean;
}

function formatBR(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/**
 * Campo de data que usa o seletor NATIVO:
 * - Web: <input type="date"> (calendário do próprio sistema/navegador).
 * - iOS/Android: DateTimePicker nativo aberto ao tocar no campo.
 */
export function DateField({ label, value, onChange, placeholder, readOnly }: DateFieldProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [show, setShow] = useState(false);

  const labelNode = label ? <Text style={styles.label}>{label}</Text> : null;

  if (Platform.OS === 'web') {
    // Input DOM real (react-dom): o navegador abre o calendário nativo.
    const input = createElement('input', {
      type: 'date',
      value: value ?? '',
      disabled: readOnly,
      onChange: (e: { target: { value: string } }) => onChange(e.target.value),
      style: {
        height: 52,
        width: '100%',
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        padding: `0 ${spacing.lg}px`,
        backgroundColor: readOnly ? colors.border : colors.surface,
        color: colors.ink,
        fontSize: 16,
        boxSizing: 'border-box',
        fontFamily: 'inherit',
      },
    });
    return (
      <View style={styles.wrap}>
        {labelNode}
        {input}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {labelNode}
      <Pressable
        style={[styles.field, readOnly && styles.readOnly]}
        onPress={() => !readOnly && setShow(true)}
      >
        <Text style={value ? styles.valueText : styles.placeholder}>
          {value ? formatBR(value) : (placeholder ?? 'Selecione a data')}
        </Text>
        <Text style={styles.icon}>📅</Text>
      </Pressable>
      {show ? (
        <DateTimePicker
          value={value ? new Date(value) : new Date()}
          mode="date"
          onChange={(_e, date) => {
            setShow(false);
            if (date) onChange(date.toISOString().slice(0, 10));
          }}
        />
      ) : null}
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    wrap: { marginBottom: spacing.lg },
    label: { ...typography.label, color: colors.inkMuted, marginBottom: spacing.sm },
    field: {
      minHeight: 52,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
    },
    readOnly: { backgroundColor: colors.border },
    valueText: { ...typography.body, color: colors.ink },
    placeholder: { ...typography.body, color: colors.inkSubtle },
    icon: { fontSize: 16 },
  });
