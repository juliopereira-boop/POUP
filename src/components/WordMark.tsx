import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/providers/ThemeProvider';
import { Mark } from './Mark';

interface WordMarkProps {
  /** Altura aproximada da logo; símbolo e texto são dimensionados a partir disso. */
  size?: number;
  color?: string;
}

/**
 * Segunda variante da marca: o símbolo + o nome "POUP" por extenso.
 * Dentro do app a marca oficial continua sendo só o símbolo (`Logo`/`Mark`);
 * esta variante com o nome é usada em contextos externos, como o cabeçalho
 * da proposta em PDF.
 */
export function WordMark({ size = 34, color }: WordMarkProps) {
  const { colors } = useTheme();
  const tint = color ?? colors.ink;
  return (
    <View style={styles.row}>
      <Mark height={size * 0.5} color={tint} />
      <Text style={[styles.text, { color: tint, fontSize: size * 0.6 }]}>POUP</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { fontWeight: '800', letterSpacing: 1 },
});
