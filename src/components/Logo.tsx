import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme';

interface LogoProps {
  size?: number;
  color?: string;
}

/**
 * Logo POUP em texto — reproduz a identidade minimalista da marca:
 * "po_p" com o "u" desenhado como um traço/underline entre o "o" e o "p".
 * Feita em código (sem imagem) para ficar nítida em qualquer resolução.
 */
export function Logo({ size = 34, color = colors.ink }: LogoProps) {
  const underlineWidth = size * 0.62;
  return (
    <View style={styles.row} accessibilityRole="header" accessibilityLabel="POUP">
      <Text style={[styles.text, { fontSize: size, color }]}>po</Text>
      <View style={styles.uWrap}>
        <View
          style={[
            styles.underline,
            { width: underlineWidth, height: Math.max(2, size * 0.06), backgroundColor: color },
          ]}
        />
      </View>
      <Text style={[styles.text, { fontSize: size, color }]}>p</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  text: {
    fontWeight: '300',
    letterSpacing: 2,
    includeFontPadding: false,
  },
  uWrap: {
    justifyContent: 'flex-end',
    paddingBottom: '14%',
    marginHorizontal: 3,
  },
  underline: {
    borderBottomLeftRadius: 999,
    borderBottomRightRadius: 999,
  },
});
