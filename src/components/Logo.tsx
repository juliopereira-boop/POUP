import { Image, StyleSheet } from 'react-native';

import { useTheme } from '@/providers/ThemeProvider';

const LIGHT = require('../../assets/logo.png');
const DARK = require('../../assets/logo-dark.png');

interface LogoProps {
  size?: number;
}

export function Logo({ size = 34 }: LogoProps) {
  const { isDark } = useTheme();
  return (
    <Image
      source={isDark ? DARK : LIGHT}
      style={[styles.img, { width: size, height: size }]}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
    />
  );
}

const styles = StyleSheet.create({
  img: { alignSelf: 'center' },
});
