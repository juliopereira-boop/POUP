/**
 * Botão "Continuar com a Apple".
 *
 * ===========================================================================
 * O LOGOTIPO DA APPLE NÃO PODE SER DESENHADO POR NÓS
 * ===========================================================================
 * Este botão desenhava a maçã num `<Path>` SVG próprio. As Human Interface
 * Guidelines do Sign in with Apple são explícitas: **nunca crie seu próprio
 * logotipo da Apple** — é obrigatório usar o botão que a Apple fornece, que no
 * Expo é o `AppleAuthenticationButton`.
 *
 * Não é preciosismo de marca. O botão nativo também garante o tamanho mínimo,
 * o raio, a fonte, o espaçamento e a tradução do rótulo para o idioma do
 * aparelho — coisas que uma reimplementação erra em silêncio e que a revisão
 * confere.
 *
 * ===========================================================================
 * DOIS CAMINHOS, PORQUE SÃO DUAS COISAS DIFERENTES
 * ===========================================================================
 * **No iOS** o botão é o nativo da Apple, e o login é o Sign in with Apple
 * nativo: a folha do sistema, com Face ID, sem sair do app.
 *
 * **Na web** não existe componente nativo. Lá o login continua sendo OAuth
 * pelo navegador, e o botão é uma reprodução em texto — sem a maçã. Um botão
 * preto escrito "Continuar com a Apple", sem logotipo, é aceitável; um
 * logotipo desenhado à mão não é.
 *
 * A consequência prática: no aplicativo, este componente só existe onde a
 * Apple manda existir.
 */
import { Platform, Pressable, StyleSheet, Text, ActivityIndicator } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';

import { radius, spacing, typography } from '@/theme';

interface AppleButtonProps {
  onPress: () => void;
  loading?: boolean;
}

export function AppleButton({ onPress, loading = false }: AppleButtonProps) {
  /*
   * O componente nativo não tem estado de carregando. Enquanto o login corre,
   * trocamos por um indicador do mesmo tamanho para o layout não pular — a
   * folha do sistema já cobre a tela, então ninguém vê os dois ao mesmo tempo.
   */
  if (Platform.OS === 'ios') {
    if (loading) {
      return (
        <Pressable disabled style={styles.carregandoNativo} accessibilityRole="button">
          <ActivityIndicator color="#FFFFFF" />
        </Pressable>
      );
    }
    return (
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={radius.lg}
        style={styles.nativo}
        onPress={onPress}
      />
    );
  }

  /*
   * Web e Android: sem maçã. O texto sozinho identifica o serviço e não
   * reproduz marca nenhuma.
   */
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
        <Text style={styles.label}>Continuar com a Apple</Text>
      )}
    </Pressable>
  );
}

const ALTURA = 52;

const styles = StyleSheet.create({
  nativo: { height: ALTURA, width: '100%' },
  carregandoNativo: {
    height: ALTURA,
    width: '100%',
    backgroundColor: '#000000',
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    // Preto sólido: exigência da Apple, não escolha de design.
    backgroundColor: '#000000',
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: ALTURA,
  },
  pressed: { opacity: 0.8 },
  label: { ...typography.label, color: '#FFFFFF' },
});
