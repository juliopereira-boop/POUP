import { Image, StyleSheet } from 'react-native';

const SOURCE = require('../../assets/logo.png');

interface LogoProps {
  size?: number;
}

export function Logo({ size = 34 }: LogoProps) {
  return (
    <Image
      source={SOURCE}
      style={[styles.img, { width: size, height: size }]}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
    />
  );
}

const styles = StyleSheet.create({
  img: { alignSelf: 'center' },
});
