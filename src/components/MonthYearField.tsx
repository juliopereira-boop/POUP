import { createElement, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';

import { Button } from './Button';
import { radius, spacing, typography, type AppColors } from '@/theme';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';

interface MonthYearFieldProps {
  label?: string;
  /** Data em ISO (yyyy-mm-dd), sempre no 1º dia do mês, ou null. */
  value: string | null;
  onChange: (iso: string) => void;
  placeholder?: string;
}

const MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

function toParts(value: string | null): { month: number; year: number } {
  if (!value) {
    const now = new Date();
    return { month: now.getMonth() + 1, year: now.getFullYear() };
  }
  const [y, m] = value.split('-').map(Number);
  return { month: m, year: y };
}

function formatBR(value: string | null): string {
  if (!value) return '';
  const { month, year } = toParts(value);
  return `${MONTHS[month - 1]}/${year}`;
}

/**
 * Campo de mês/ano (sem dia) usado na data de entrega do empreendimento.
 * - Web: <input type="month"> (seletor nativo do navegador).
 * - iOS/Android: modal com dois seletores nativos (mês e ano).
 */
export function MonthYearField({ label, value, onChange, placeholder }: MonthYearFieldProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const labelNode = label ? <Text style={styles.label}>{label}</Text> : null;

  if (Platform.OS === 'web') {
    const monthValue = value ? value.slice(0, 7) : '';
    const input = createElement('input', {
      type: 'month',
      value: monthValue,
      onChange: (e: { target: { value: string } }) => {
        if (e.target.value) onChange(`${e.target.value}-01`);
      },
      style: {
        height: 52,
        width: '100%',
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        padding: `0 ${spacing.lg}px`,
        backgroundColor: colors.surface,
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
    <NativeMonthYear
      label={labelNode}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      styles={styles}
      colors={colors}
    />
  );
}

function NativeMonthYear({
  label,
  value,
  onChange,
  placeholder,
  styles,
  colors,
}: {
  label: React.ReactNode;
  value: string | null;
  onChange: (iso: string) => void;
  placeholder?: string;
  styles: ReturnType<typeof makeStyles>;
  colors: AppColors;
}) {
  const [open, setOpen] = useState(false);
  const parts = toParts(value);
  const [tempMonth, setTempMonth] = useState(parts.month);
  const [tempYear, setTempYear] = useState(parts.year);
  const years = Array.from({ length: 21 }, (_, i) => new Date().getFullYear() + i - 2);

  return (
    <View style={styles.wrap}>
      {label}
      <Pressable
        style={styles.field}
        onPress={() => {
          setTempMonth(parts.month);
          setTempYear(parts.year);
          setOpen(true);
        }}
      >
        <Text style={value ? styles.valueText : styles.placeholder}>
          {value ? formatBR(value) : (placeholder ?? 'Selecione mês/ano')}
        </Text>
        <Text style={styles.icon}>📅</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.pickerRow}>
              <Picker
                style={styles.pickerCol}
                selectedValue={tempMonth}
                onValueChange={(v) => setTempMonth(Number(v))}
                itemStyle={{ color: colors.ink }}
              >
                {MONTHS.map((m, i) => (
                  <Picker.Item key={i + 1} label={m} value={i + 1} color={colors.ink} />
                ))}
              </Picker>
              <Picker
                style={styles.pickerCol}
                selectedValue={tempYear}
                onValueChange={(v) => setTempYear(Number(v))}
                itemStyle={{ color: colors.ink }}
              >
                {years.map((y) => (
                  <Picker.Item key={y} label={String(y)} value={y} color={colors.ink} />
                ))}
              </Picker>
            </View>
            <Button
              label="Confirmar"
              onPress={() => {
                onChange(`${tempYear}-${String(tempMonth).padStart(2, '0')}-01`);
                setOpen(false);
              }}
            />
          </View>
        </View>
      </Modal>
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
    valueText: { ...typography.body, color: colors.ink },
    placeholder: { ...typography.body, color: colors.inkSubtle },
    icon: { fontSize: 16 },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.surface, padding: spacing.lg, paddingBottom: spacing.xxl },
    pickerRow: { flexDirection: 'row' },
    pickerCol: { flex: 1 },
  });
