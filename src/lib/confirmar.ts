/**
 * Uma pergunta de sim/não, igual no celular e no navegador.
 *
 * No celular, o `Alert` nativo; no navegador, o `window.confirm` (o `Alert` do
 * React Native Web não mostra botões). Resolve `true` só no botão de seguir.
 */
import { Alert, Platform } from 'react-native';

export function confirmar(titulo: string, texto: string, rotuloSeguir = 'Continuar'): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(typeof window !== 'undefined' && window.confirm(`${titulo}\n\n${texto}`));
  }
  return new Promise((resolve) => {
    Alert.alert(
      titulo,
      texto,
      [
        { text: 'Voltar', style: 'cancel', onPress: () => resolve(false) },
        { text: rotuloSeguir, onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
