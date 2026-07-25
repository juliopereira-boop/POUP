import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/providers/ThemeProvider';

const WIDTH_TO_HEIGHT = 3.44;
const STROKE_TO_HEIGHT = 0.1375;
const RADIUS_TO_HEIGHT = 0.42;

interface MarkProps {
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
