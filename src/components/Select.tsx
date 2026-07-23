import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { radius, spacing, typography, type AppColors } from '@/theme';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';

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
  /** Mostra um campo de busca no topo da lista (útil para listas longas). */
  searchable?: boolean;
}

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Dropdown simples (expande/colapsa uma lista abaixo do campo).
 * Funciona igual em web e nativo, sem depender de picker nativo.
 */
export function Select({
  label,
  placeholder,
  value,
  options,
  onChange,
  emptyHint,
  searchable = false,
}: SelectProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = norm(query.trim());
    return options.filter((o) => norm(o.label).includes(q));
  }, [options, query, searchable]);

  function close() {
    setOpen(false);
    setQuery('');
  }

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        onPress={() => (open ? close() : setOpen(true))}
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
          {searchable ? (
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar…"
              placeholderTextColor={colors.inkSubtle}
              style={styles.search}
              autoFocus
            />
          ) : null}
          {filtered.length === 0 ? (
            <Text style={styles.empty}>{emptyHint ?? 'Nenhuma opção disponível.'}</Text>
          ) : (
            <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
              {filtered.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => {
                    onChange(opt.value);
                    close();
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
              ))}
            </ScrollView>
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
    search: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      color: colors.ink,
      fontSize: 16,
    },
    scroll: { maxHeight: 260 },
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
