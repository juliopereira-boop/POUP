import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/providers/ThemeProvider';
import { Logo } from './Logo';

interface WordMarkProps {
  size?: number;
  color?: string;
  /** Sobre fundo colorido/escuro, usa a marca clara. */
  onDark?: boolean;
}

export function WordMark({ size = 34, color, onDark }: WordMarkProps) {
  const { colors } = useTheme();
  const tint = color ?? colors.ink;
  return (
    <View style={styles.row}>
      <Logo size={size} onDark={onDark} />
      <Text style={[styles.text, { color: tint, fontSize: size * 0.6 }]}>POUP</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { fontWeight: '800', letterSpacing: 1 },
});
