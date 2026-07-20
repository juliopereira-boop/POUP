import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';

import { Button } from './Button';
import { radius, spacing, typography, type AppColors } from '@/theme';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';

interface NumberPickerFieldProps {
  label?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}

/**
 * Campo numérico que abre o SELETOR NATIVO do aparelho (igual ao de horário):
 * - Web (inclui navegador do celular): renderiza um <select> nativo — ao tocar,
 *   o sistema abre sua própria roleta/lista.
 * - iOS/Android (app nativo): um botão que abre a roleta nativa num modal.
 */
export function NumberPickerField({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
}: NumberPickerFieldProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const options = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  // ---- Web: <select> nativo estilizado como campo ----
  if (Platform.OS === 'web') {
    return (
      <View style={styles.wrap}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        <View style={styles.field}>
          <Picker
            selectedValue={String(value)}
            onValueChange={(v) => onChange(Number(v))}
            style={webPickerStyle(colors.ink)}
          >
            {options.map((n) => (
              <Picker.Item key={n} label={String(n)} value={String(n)} />
            ))}
          </Picker>
        </View>
      </View>
    );
  }

  // ---- Nativo: botão que abre a roleta nativa num modal ----
  return <NativePicker label={label} value={value} onChange={onChange} options={options} />;
}

function NativePicker({
  label,
  value,
  onChange,
  options,
}: {
  label?: string;
  value: number;
  onChange: (v: number) => void;
  options: number[];
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [open, setOpen] = useState(false);
  const [temp, setTemp] = useState(value);

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        style={styles.field}
        onPress={() => {
          setTemp(value);
          setOpen(true);
        }}
      >
        <Text style={styles.valueText}>{value}</Text>
        <Text style={styles.caret}>▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Picker selectedValue={temp} onValueChange={(v) => setTemp(Number(v))} itemStyle={{ color: colors.ink }}>
              {options.map((n) => (
                <Picker.Item key={n} label={String(n)} value={n} color={colors.ink} />
              ))}
            </Picker>
            <Button
              label="Confirmar"
              onPress={() => {
                onChange(temp);
                setOpen(false);
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function webPickerStyle(color: string) {
  return {
    height: 52,
    width: '100%',
    borderWidth: 0,
    backgroundColor: 'transparent',
    color,
    fontSize: 16,
    paddingHorizontal: spacing.lg,
  } as const;
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
      overflow: 'hidden',
    },
    valueText: { ...typography.body, color: colors.ink },
    caret: { ...typography.body, color: colors.inkSubtle },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.surface, padding: spacing.lg, paddingBottom: spacing.xxl },
  });
