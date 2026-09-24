/**
 * Botões lado a lado para escolher UMA opção entre poucas ("Carro | Moto").
 *
 * Para duas a quatro opções curtas, um seletor que abre lista esconde o que
 * já cabe na tela — aqui o corretor vê todas e troca com um toque.
 */
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

export interface OpcaoDoSegmento<T extends string> {
  valor: T;
  rotulo: string;
}

interface Props<T extends string> {
  opcoes: OpcaoDoSegmento<T>[];
  valor: T;
  onMudar: (v: T) => void;
  rotulo?: string;
  desabilitado?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Segmento<T extends string>({ opcoes, valor, onMudar, rotulo, desabilitado, style }: Props<T>) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={style}>
      {rotulo ? <Text style={styles.rotulo}>{rotulo}</Text> : null}
      <View style={styles.trilho} accessibilityRole="radiogroup">
        {opcoes.map((o) => {
          const ativo = o.valor === valor;
          return (
            <Pressable
              key={o.valor}
              onPress={() => !desabilitado && onMudar(o.valor)}
              disabled={desabilitado}
              accessibilityRole="radio"
              accessibilityState={{ checked: ativo, disabled: desabilitado }}
              style={[styles.item, ativo && styles.itemAtivo]}
            >
              <Text style={[styles.texto, ativo && styles.textoAtivo]} numberOfLines={1}>
                {o.rotulo}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    rotulo: { ...typography.label, color: colors.ink, marginBottom: spacing.xs },
    trilho: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 3,
      gap: 3,
    },
    item: {
      flex: 1,
      minHeight: 36,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemAtivo: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
    texto: { ...typography.label, color: colors.inkMuted },
    textoAtivo: { color: colors.primary },
  });
