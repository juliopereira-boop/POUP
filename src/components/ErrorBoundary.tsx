/**
 * A REDE DE SEGURANÇA CONTRA A TELA BRANCA.
 *
 * ===========================================================================
 * O PROBLEMA QUE ELA RESOLVE
 * ===========================================================================
 * Quando um componente React quebra durante a renderização e ninguém captura o
 * erro, o React **desmonta a árvore inteira**. O resultado, para quem está
 * usando, é uma tela branca: nenhum aviso, nenhum botão, nada. E para quem vai
 * consertar é pior ainda — o relato que chega é "ficou tudo branco", que não
 * diz em que tela, em que ação nem por quê.
 *
 * Uma fronteira de erro troca isso por uma tela que diz o que aconteceu, mostra
 * a mensagem técnica e oferece um caminho de volta. O aplicativo continua
 * inutilizável naquele ponto — mas deixa de ser um mistério.
 *
 * ===========================================================================
 * POR QUE ELA NÃO USA O TEMA, NEM NENHUM PROVIDER
 * ===========================================================================
 * Esta tela é a última linha. Se ela dependesse do `ThemeProvider`, do
 * `AuthProvider` ou de qualquer contexto, um erro **dentro** desses providers
 * derrubaria também a tela de erro — e voltaríamos ao branco. Por isso ela usa
 * cores literais e nada além de `View`, `Text` e `Pressable`.
 *
 * ===========================================================================
 * POR QUE A MENSAGEM TÉCNICA FICA VISÍVEL
 * ===========================================================================
 * Esconder o erro atrás de "algo deu errado" transforma cada suporte numa
 * escavação. Mostrando a mensagem, o corretor tira um print e quem conserta já
 * sabe onde olhar. O texto fica selecionável na web justamente para poder ser
 * copiado.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

interface Props {
  children: ReactNode;
  /** Descreve o trecho protegido, para a mensagem dizer onde quebrou. */
  onde?: string;
}

interface State {
  erro: Error | null;
  pilha: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { erro: null, pilha: null };

  static getDerivedStateFromError(erro: Error): Partial<State> {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    /*
     * O console é o único destino garantido aqui. Mandar para um serviço de
     * telemetria exigiria rede — e a fronteira de erro precisa funcionar
     * justamente quando as coisas não estão funcionando.
     */
    console.error('[POUP] Erro não tratado na interface:', erro, info.componentStack);
    this.setState({ pilha: info.componentStack ?? null });
  }

  private recarregar = () => {
    /*
     * Na web, recarregar de verdade é o caminho mais confiável: limpa qualquer
     * estado corrompido que tenha causado o erro. No aparelho não há reload, e
     * o melhor que dá para fazer é tentar montar a árvore de novo.
     */
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.reload();
      return;
    }
    this.setState({ erro: null, pilha: null });
  };

  private inicio = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = '/';
      return;
    }
    this.setState({ erro: null, pilha: null });
  };

  render() {
    const { erro, pilha } = this.state;
    if (!erro) return this.props.children;

    const onde = this.props.onde ? ` em ${this.props.onde}` : '';

    return (
      <View style={estilos.fundo}>
        <ScrollView contentContainerStyle={estilos.conteudo}>
          <Text style={estilos.titulo}>Esta tela travou</Text>
          <Text style={estilos.texto}>
            Alguma coisa quebrou{onde} e o POUP preferiu avisar em vez de sumir com a tela. Seus
            dados estão salvos — nada foi perdido.
          </Text>

          <View style={estilos.caixa}>
            <Text style={estilos.caixaTitulo}>O que aconteceu</Text>
            <Text style={estilos.caixaTexto} selectable>
              {erro.message || String(erro)}
            </Text>
            {pilha ? (
              <Text style={estilos.pilha} selectable numberOfLines={12}>
                {pilha.trim()}
              </Text>
            ) : null}
          </View>

          <Pressable
            onPress={this.recarregar}
            accessibilityRole="button"
            accessibilityLabel="Tentar de novo"
            style={estilos.botao}
          >
            <Text style={estilos.botaoTexto}>Tentar de novo</Text>
          </Pressable>

          <Pressable
            onPress={this.inicio}
            accessibilityRole="button"
            accessibilityLabel="Voltar ao início"
            style={estilos.secundario}
          >
            <Text style={estilos.secundarioTexto}>Voltar ao início</Text>
          </Pressable>

          <Text style={estilos.rodape}>
            Se acontecer de novo, mande um print desta tela para o suporte — a mensagem acima diz
            exatamente onde consertar.
          </Text>
        </ScrollView>
      </View>
    );
  }
}

/*
 * Cores literais, de propósito: ver o comentário do topo. Elas são as mesmas do
 * tema claro, o que faz esta tela parecer parte do aplicativo sem depender dele.
 */
const estilos = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: '#F3F4F6' },
  conteudo: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
  },
  titulo: { fontSize: 22, fontWeight: '700', color: '#111827' },
  texto: { fontSize: 15, color: '#6B7280', lineHeight: 21 },
  caixa: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    gap: 6,
    marginVertical: 8,
  },
  caixaTitulo: { fontSize: 13, fontWeight: '700', color: '#111827' },
  caixaTexto: { fontSize: 13, color: '#DC2626', lineHeight: 18 },
  pilha: { fontSize: 11, color: '#9CA3AF', lineHeight: 15, marginTop: 4 },
  botao: {
    backgroundColor: '#FF751F',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  botaoTexto: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  secundario: { paddingVertical: 12, alignItems: 'center' },
  secundarioTexto: { color: '#6B7280', fontSize: 14, fontWeight: '600' },
  rodape: { fontSize: 12, color: '#9CA3AF', lineHeight: 17, textAlign: 'center' },
});
