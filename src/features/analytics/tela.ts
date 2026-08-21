/**
 * QUAL TELA O CORRETOR ESTAVA VENDO.
 *
 * ===========================================================================
 * O PROBLEMA QUE ISTO RESOLVE
 * ===========================================================================
 * O botão "Reportar problema ou dar sugestão" mora em Ajustes → Ajuda. Mas o
 * problema não aconteceu em Ajustes: aconteceu no simulador, na proposta, no
 * lead. Quando o corretor termina de navegar até o formulário de reporte, a
 * informação mais útil — **onde** deu errado — já se perdeu.
 *
 * Perguntar "em qual tela?" seria pior: ele não sabe o nome interno da rota, e
 * "na tela de fazer conta" não localiza nada num relatório.
 *
 * Então o app se lembra por ele. Este módulo guarda as últimas rotas visitadas
 * e sabe descartar as que são o próprio caminho do reporte.
 *
 * ===========================================================================
 * POR QUE UM MÓDULO E NÃO UM PROVIDER
 * ===========================================================================
 * Um provider colocaria a rota atual no estado do React, e cada navegação
 * re-renderizaria toda a árvore abaixo dele — um custo permanente para uma
 * informação que só é lida quando alguém abre o formulário de reporte. Uma
 * variável de módulo custa zero e é lida sob demanda.
 *
 * ===========================================================================
 * ISTO NÃO É TELEMETRIA
 * ===========================================================================
 * Nada aqui vai para o banco. A rota só sai da memória do aparelho se o
 * corretor escrever um reporte e enviar — e nesse caso ele está pedindo que
 * saia. Registrar cada navegação como evento seria caro (dezenas por sessão) e
 * responderia uma pergunta que ninguém tem.
 */

/** Quantas rotas guardar. Três dá para pular Ajustes e Suporte e ainda achar a real. */
const TAMANHO = 4;

const historico: string[] = [];

/**
 * Rotas que NÃO servem como resposta a "onde aconteceu".
 *
 * São o caminho que o corretor percorre para chegar ao reporte. Se não fossem
 * descartadas, todo reporte diria "aconteceu em Ajustes".
 */
const CAMINHO_DO_REPORTE = ['/configuracoes', '/suporte', '/reportar'];

/** Registra a rota atual. Chamado pelo `useRastrearTela` no layout do app. */
export function anotarTela(rota: string): void {
  const limpo = rota.trim();
  if (!limpo) return;
  // Mesma rota duas vezes seguidas (um re-render, um parâmetro que mudou) não
  // gasta uma vaga do histórico.
  if (historico[historico.length - 1] === limpo) return;
  historico.push(limpo);
  if (historico.length > TAMANHO) historico.shift();
}

/**
 * A tela onde o problema provavelmente aconteceu.
 *
 * Anda de trás para frente no histórico e devolve a primeira rota que não faz
 * parte do caminho do reporte. Se tudo no histórico for esse caminho, devolve a
 * rota atual mesmo — melhor uma pista fraca do que nenhuma.
 */
export function telaDoProblema(): string | null {
  for (let i = historico.length - 1; i >= 0; i--) {
    const rota = historico[i];
    if (!CAMINHO_DO_REPORTE.some((c) => rota.startsWith(c))) return rota;
  }
  return historico[historico.length - 1] ?? null;
}
