import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/providers/ThemeProvider';

/**
 * Marca oficial do POUP — o traço em formato de "U" aberto no topo, com as
 * pontas inferiores arredondadas. É o símbolo usado sozinho (ícone do app,
 * favicon, logo dentro do app).
 *
 * Desenhada com bordas (sem imagem/SVG): um retângulo sem borda superior,
 * com os dois cantos inferiores arredondados.
 */
const WIDTH_TO_HEIGHT = 3.44;
const STROKE_TO_HEIGHT = 0.1375;
const RADIUS_TO_HEIGHT = 0.42;

interface MarkProps {
  /** Altura do traço; a largura é derivada automaticamente (proporção fixa). */
  height?: number;
  color?: string;
}

export function Mark({ height = 24, color }: MarkProps) {
  const { colors } = useTheme();
  const stroke = color ?? colors.ink;
  const width = height * WIDTH_TO_HEIGHT;
  const strokeWidth = Math.max(1, height * STROKE_TO_HEIGHT);
  const radius = height * RADIUS_TO_HEIGHT;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.base,
        {
          width,
          height,
          borderColor: stroke,
          borderLeftWidth: strokeWidth,
          borderRightWidth: strokeWidth,
          borderBottomWidth: strokeWidth,
          borderBottomLeftRadius: radius,
          borderBottomRightRadius: radius,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    borderTopWidth: 0,
    backgroundColor: 'transparent',
  },
});
