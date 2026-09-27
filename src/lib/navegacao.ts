/**
 * VOLTAR COM SEGURANÇA — o mesmo caminho para todo "voltar" do aplicativo.
 *
 * ===========================================================================
 * O BUG QUE MOTIVOU ISTO (TestFlight, setembro/2026)
 * ===========================================================================
 * Indo e voltando entre as telas no iPhone, o botão "Voltar" do cabeçalho
 * parava de responder, e só voltava a funcionar fechando o app. Aconteceu em
 * dois aparelhos.
 *
 * A causa estava no botão NATIVO do iOS 26, dentro do `react-native-screens`
 * 4.16: ao tocar em voltar, ele desliga o toque do botão e só religa quando o
 * iOS avisa que a tela saiu (`didPopItem`). Quando esse aviso não chega — um
 * toque durante uma transição, a volta para uma tela sem cabeçalho nativo como
 * o Início —, o botão fica desligado para sempre. Bug conhecido da biblioteca
 * (software-mansion/react-native-screens#3294), corrigido a partir da 4.17.
 *
 * ===========================================================================
 * A CORREÇÃO PERMANENTE
 * ===========================================================================
 * 1. A biblioteca foi atualizada (sem o trecho defeituoso).
 * 2. O cabeçalho não usa mais o botão nativo: usa `BotaoVoltar`, que chama
 *    `voltar()` daqui. Um botão nosso não depende de aviso nenhum do iOS para
 *    continuar funcionando — e o gesto de arrastar da borda continua valendo.
 * 3. `voltar()` nunca deixa o corretor preso:
 *    - toque duplo não volta duas telas (trava curta entre voltas);
 *    - tela aberta sem histórico (link, notificação, depois de trocar de aba)
 *      volta para o Início em vez de não fazer nada.
 */
import { Platform } from 'react-native';
import type { Href } from 'expo-router';

interface RoteadorMinimo {
  back: () => void;
  canGoBack: () => boolean;
  replace: (href: Href) => void;
}

/** Tempo mínimo entre duas voltas: um toque duplo não pode voltar duas telas. */
export const INTERVALO_ENTRE_VOLTAS_MS = 450;

let ultimaVolta = 0;

/**
 * Volta uma tela. Sem para onde voltar, vai para `semHistorico` (o Início).
 * Devolve `false` quando ignorou o toque (dentro da trava de toque duplo).
 */
export function voltar(router: RoteadorMinimo, semHistorico: Href = '/(app)', agora: number = Date.now()): boolean {
  if (agora - ultimaVolta < INTERVALO_ENTRE_VOLTAS_MS) return false;
  ultimaVolta = agora;
  if (router.canGoBack()) router.back();
  else router.replace(semHistorico);
  return true;
}

/**
 * O tempo que uma janela (`Modal`) leva para sumir no iPhone.
 *
 * Fechar uma janela e abrir outra tela no MESMO instante é o outro jeito de o
 * app "travar" no iOS: a tela nova é apresentada enquanto a janela ainda está
 * saindo, e pode sobrar uma camada invisível por cima que engole os toques
 * (inclusive o do "Voltar"). Então quem fecha uma janela para navegar espera
 * ela sair — `depoisDeFecharJanela`.
 */
export const ESPERA_FECHAR_JANELA_MS = 400;

export function depoisDeFecharJanela(acao: () => void): void {
  if (Platform.OS === 'ios') setTimeout(acao, ESPERA_FECHAR_JANELA_MS);
  else acao();
}

/** Só para os testes: zera a trava de toque duplo. */
export function reiniciarTravaDeVolta(): void {
  ultimaVolta = 0;
}
