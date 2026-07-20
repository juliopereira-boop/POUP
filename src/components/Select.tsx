import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, typography, type AppColors } from '@/theme';
import { useThemedStyles } from '@/providers/ThemeProvider';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label?: string;
  placeholder?: string;
  value: string | null;
  options: SelectOption[];
  onChange: (value: string) => void;
  /** Mensagem exibida quando não há opções (ex.: cadastre uma empresa antes). */
  emptyHint?: string;
}

/**
 * Dropdown simples (expande/colapsa uma lista abaixo do campo).
 * Funciona igual em web e nativo, sem depender de picker nativo.
 */
export function Select({ label, placeholder, value, options, onChange, emptyHint }: SelectProps) {
  const styles = useThemedStyles(makeStyles);
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={styles.field}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={selected ? styles.valueText : styles.placeholder} numberOfLines={1}>
          {selected ? selected.label : (placeholder ?? 'Selecione')}
        </Text>
        <Text style={styles.caret}>{open ? '▲' : '▼'}</Text>
      </Pressable>

      {open ? (
        <View style={styles.list}>
          {options.length === 0 ? (
            <Text style={styles.empty}>{emptyHint ?? 'Nenhuma opção disponível.'}</Text>
          ) : (
            options.map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
              >
                <Text
                  style={[styles.optionText, opt.value === value && styles.optionTextActive]}
                  numberOfLines={1}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))
          )}
        </View>
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
      paddingHorizontal: spacing.lg,
      backgroundColor: colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    valueText: { ...typography.body, color: colors.ink, flex: 1 },
    placeholder: { ...typography.body, color: colors.inkSubtle, flex: 1 },
    caret: { ...typography.caption, color: colors.inkSubtle, marginLeft: spacing.sm },
    list: {
      marginTop: spacing.xs,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    option: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
    optionPressed: { backgroundColor: colors.surfaceAlt },
    optionText: { ...typography.body, color: colors.ink },
    optionTextActive: { color: colors.primary, fontWeight: '600' },
    empty: {
      ...typography.caption,
      color: colors.inkSubtle,
      padding: spacing.lg,
      textAlign: 'center',
    },
  });
