import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/theme';
import { Mark } from './Mark';

interface LogoProps {
  size?: number;
  color?: string;
  /** "poup" (minúsculas, como no app) ou "POUP" (maiúsculas, como no wordmark). */
  variant?: 'lowercase' | 'uppercase';
}

/**
 * Logo POUP — a marca (ícone) oficial ao lado do wordmark em texto.
 * Sem imagem, para ficar nítida em qualquer resolução e tamanho.
 */
export function Logo({ size = 34, color = colors.ink, variant = 'lowercase' }: LogoProps) {
  return (
    <View style={styles.row} accessibilityRole="header" accessibilityLabel="POUP">
      <Mark height={size * 0.42} color={color} />
      <Text style={[styles.text, { fontSize: size, color, lineHeight: size * 1.2 }]}>
        {variant === 'uppercase' ? 'POUP' : 'poup'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  text: {
    fontWeight: '300',
    letterSpacing: 2,
  },
});
