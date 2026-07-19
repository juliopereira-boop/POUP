import { StyleSheet, Text } from 'react-native';

import { colors } from '@/theme';

interface LogoProps {
  size?: number;
  color?: string;
  /** "poup" (minúsculas, como no app) ou "POUP" (maiúsculas, como no wordmark). */
  variant?: 'lowercase' | 'uppercase';
}

/**
 * Logo POUP — wordmark em texto fino/geométrico, igual à marca oficial.
 * Sem imagem, para ficar nítida em qualquer resolução e tamanho.
 */
export function Logo({ size = 34, color = colors.ink, variant = 'lowercase' }: LogoProps) {
  return (
    <Text
      accessibilityRole="header"
      accessibilityLabel="POUP"
      style={[styles.text, { fontSize: size, color, lineHeight: size * 1.2 }]}
    >
      {variant === 'uppercase' ? 'POUP' : 'poup'}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontWeight: '300',
    letterSpacing: 2,
  },
});
