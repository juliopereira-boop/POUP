import { createElement, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

import { dateKey } from './dates';

interface DayFieldProps {
  label?: string;
  value: string | null;
  onChange: (ymd: string) => void;
  placeholder?: string;
}

function toLocalDate(ymd: string | null): Date {
  const match = ymd ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd) : null;
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
}

function formatBR(ymd: string | null): string {
  const match = ymd ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd) : null;
  if (!match) return '';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function DayField({ label, value, onChange, placeholder }: DayFieldProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [show, setShow] = useState(false);

  const labelNode = label ? <Text style={styles.label}>{label}</Text> : null;

  if (Platform.OS === 'web') {
    return (
      <View style={styles.wrap}>
        {labelNode}
        {createElement('input', {
          type: 'date',
          value: value ?? '',
          onChange: (e: { target: { value: string } }) => onChange(e.target.value),
          style: {
            height: 52,
            width: '100%',
            minWidth: 0,
            maxWidth: '100%',
            border: `1px solid ${colors.border}`,
            borderRadius: radius.md,
            padding: `0 ${spacing.lg}px`,
            backgroundColor: colors.surface,
            color: colors.ink,
            fontSize: 16,
            boxSizing: 'border-box',
            fontFamily: 'inherit',
          },
        })}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {labelNode}
      <Pressable style={styles.field} onPress={() => setShow(true)}>
        <Text style={value ? styles.valueText : styles.placeholder}>
          {value ? formatBR(value) : (placeholder ?? 'Selecione a data')}
        </Text>
        <Text style={styles.icon}>📅</Text>
      </Pressable>
      {show ? (
        <DateTimePicker
          value={toLocalDate(value)}
          mode="date"
          onChange={(_event, date) => {
            setShow(false);
            if (date) onChange(dateKey(date));
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
    valueText: { ...typography.body, color: colors.ink },
    placeholder: { ...typography.body, color: colors.inkSubtle },
    icon: { fontSize: 16 },
  });
