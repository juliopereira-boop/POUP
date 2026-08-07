/**
 * Botão "Continuar com a Apple".
 *
 * ------------------------------------------------------------------
 * POR QUE ELE PRECISA SER ASSIM
 * ------------------------------------------------------------------
 * A Apple publica regras de aparência para este botão, e a revisão confere:
 * fundo preto (ou branco) sólido, a maçã junto do texto, e nada de cor de
 * marca própria. Por isso ele NÃO usa `colors.primary` como o resto do app —
 * é o único botão que ignora o tema de propósito.
 *
 * O tamanho e o raio acompanham o `GoogleButton` para os dois ficarem
 * alinhados na tela: a regra da Apple é sobre cor e conteúdo, não sobre o
 * botão destoar do vizinho.
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { radius, spacing, typography } from '@/theme';

/** A maçã, em caminho vetorial — sem imagem para carregar. */
function AppleIcon({ size = 20, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 384 512">
      <Path
        fill={color}
        d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"
      />
    </Svg>
  );
}

interface AppleButtonProps {
  onPress: () => void;
  loading?: boolean;
}

export function AppleButton({ onPress, loading = false }: AppleButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel="Continuar com a Apple"
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <View style={styles.content}>
          <AppleIcon />
          <Text style={styles.label}>Continuar com a Apple</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    // Preto sólido: exigência da Apple, não escolha de design.
    backgroundColor: '#000000',
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  pressed: { opacity: 0.8 },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  label: { ...typography.label, color: '#FFFFFF' },
});
