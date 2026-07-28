import { Image, StyleSheet } from 'react-native';

import { useTheme } from '@/providers/ThemeProvider';

const LIGHT = require('../../assets/logo.png');
const DARK = require('../../assets/logo-dark.png');

interface LogoProps {
  size?: number;
  /** Força a versão clara da marca, para uso sobre fundo colorido/escuro. */
  onDark?: boolean;
}

export function Logo({ size = 34, onDark }: LogoProps) {
  const { isDark } = useTheme();
  return (
    <Image
      source={onDark || isDark ? DARK : LIGHT}
      style={[styles.img, { width: size, height: size }]}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
    />
  );
}

const styles = StyleSheet.create({
  img: { alignSelf: 'center' },
});
