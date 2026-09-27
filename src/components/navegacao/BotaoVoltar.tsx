/**
 * O "VOLTAR" DO CABEÇALHO — nosso, e não o nativo do iOS.
 *
 * O botão nativo do iOS 26 (via `react-native-screens`) travava depois de
 * várias idas e voltas. Este é um botão comum de React Native: ele não depende
 * de aviso nenhum do sistema para continuar respondendo. Ver `lib/navegacao.ts`.
 *
 * `cabecalhoComVoltar` é o que os três `Stack` do app usam (o principal, o do
 * simulador e o do financiamento): esconde o botão nativo e põe este no lugar,
 * só quando existe tela para onde voltar.
 */
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { voltar } from '@/lib/navegacao';
import { useTheme } from '@/providers/ThemeProvider';
import { spacing, typography } from '@/theme';

export function BotaoVoltar({ cor, semHistorico }: { cor: string; semHistorico?: Parameters<typeof voltar>[1] }) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => voltar(router, semHistorico)}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 16 }}
      accessibilityRole="button"
      accessibilityLabel="Voltar"
      style={({ pressed }) => [styles.botao, pressed && styles.pressionado]}
    >
      <View style={styles.conteudo}>
        <Text style={[styles.seta, { color: cor }]}>‹</Text>
        <Text style={[styles.texto, { color: cor }]}>Voltar</Text>
      </View>
    </Pressable>
  );
}

/**
 * "Voltar" no topo das páginas sem cabeçalho (Termos, Privacidade, Suporte,
 * Excluir conta). Elas moram fora do app logado, num `Stack` sem cabeçalho —
 * sem isto, quem chegava por Ajustes no iPhone não tinha como sair.
 */
export function VoltarNoTopo() {
  const { colors } = useTheme();
  return (
    <View style={styles.topo}>
      <BotaoVoltar cor={colors.primary} semHistorico="/" />
    </View>
  );
}

/** As opções de cabeçalho com o nosso "Voltar". `cor` é a do título/ícones. */
export function cabecalhoComVoltar(cor: string) {
  return {
    headerBackVisible: false,
    headerLeft: ({ canGoBack }: { canGoBack?: boolean }) => (canGoBack ? <BotaoVoltar cor={cor} /> : null),
  };
}

const styles = StyleSheet.create({
  topo: { alignSelf: 'flex-start', marginBottom: spacing.md, marginLeft: -spacing.xs },
  botao: {
    paddingVertical: spacing.xs,
    paddingRight: spacing.sm,
    // No iOS o cabeçalho já dá o recuo da borda; na web e no Android, não.
    marginLeft: Platform.OS === 'ios' ? 0 : spacing.xs,
  },
  pressionado: { opacity: 0.5 },
  conteudo: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seta: { fontSize: 30, lineHeight: 30, fontWeight: '300', marginTop: -3 },
  texto: { ...typography.body, fontWeight: '500' },
});
