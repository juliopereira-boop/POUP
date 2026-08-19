/**
 * A PORTA PARA OS BANCOS — que hoje tem uma implementação só.
 *
 * ===========================================================================
 * POR QUE ESTA INTERFACE EXISTE ANTES DE SER NECESSÁRIA
 * ===========================================================================
 * Não existe API pública e documentada da CAIXA que permita simular
 * financiamento a partir de outro sistema. E enquanto não existir, este
 * aplicativo **não vai** raspar a página, reproduzir chamada interna, contornar
 * autenticação ou automatizar acesso de terceiros. Isso não é escrúpulo
 * abstrato: um simulador que depende de scraping quebra na primeira mudança de
 * layout, no meio de um atendimento, e o corretor não tem como saber por quê.
 *
 * O que dá para fazer hoje, e é o que está feito, é ter **motor próprio** com
 * matemática correta e parâmetros configuráveis — e deixar a porta pronta para
 * o dia em que existir integração oficial.
 *
 * A porta é esta interface. `InternalSimulationProvider` é a implementação de
 * hoje; `CaixaProvider`, `ItauProvider` e companhia seriam outras
 * implementações, sem que nenhuma tela precise mudar. É o mesmo padrão que o
 * resto do POUP usa em `src/data/repositories.ts`, e pelo mesmo motivo.
 */
import type { ResultadoElegibilidade } from './elegibilidade';
import { simular, type EntradaSimulacao, type SaidaSimulacao } from './motor';
import { poderDeCompra, type EntradaPoderDeCompra, type ResultadoPoderDeCompra } from './reverso';
import type { VersaoRegras } from './regras';

export interface FinancingProvider {
  /** Identificador curto, gravado junto com a simulação. */
  readonly id: string;
  readonly nome: string;
  /**
   * A condição vem de uma instituição financeira de verdade?
   *
   * `false` no provedor interno, e a tela usa isso para escolher entre
   * "Simulação estimada" e o nome do banco. Nunca deixe um provedor interno
   * responder `true`: é o campo que separa cálculo de proposta.
   */
  readonly oficial: boolean;

  simular(entrada: EntradaSimulacao, regras: VersaoRegras): Promise<SaidaSimulacao>;
  poderDeCompra(entrada: EntradaPoderDeCompra): Promise<ResultadoPoderDeCompra>;
  verificarEnquadramento(
    entrada: EntradaSimulacao,
    regras: VersaoRegras,
  ): Promise<ResultadoElegibilidade | null>;
}

/**
 * O provedor de hoje: a nossa própria matemática sobre as regras cadastradas.
 *
 * Os métodos são assíncronos mesmo sendo síncronos por dentro. É de propósito:
 * quando um provedor de banco entrar, ele será assíncrono de verdade, e as
 * telas não vão precisar mudar de forma. Trocar a assinatura depois seria
 * mexer em toda chamada do aplicativo.
 */
export const provedorInterno: FinancingProvider = {
  id: 'interno',
  nome: 'Simulação POUP',
  oficial: false,

  async simular(entrada, regras) {
    return simular(entrada, regras);
  },

  async poderDeCompra(entrada) {
    return poderDeCompra(entrada);
  },

  async verificarEnquadramento(entrada, regras) {
    const r = simular(entrada, regras);
    return r.ok ? r.resultado.elegibilidade : null;
  },
};

/**
 * O enquadramento de uma entrada, sem o corretor ter que ler o resultado todo.
 *
 * Quando o motor RECUSA a simulação (falta a taxa da linha, por exemplo), não
 * há enquadramento a devolver — e devolver um objeto vazio faria a tela dizer
 * "apto" para um caso que sequer foi calculado. Nesse caso sai `null`, e a tela
 * mostra o motivo da recusa.
 */
export function enquadramentoDe(
  entrada: EntradaSimulacao,
  regras: VersaoRegras,
): ResultadoElegibilidade | null {
  const r = simular(entrada, regras);
  return r.ok ? r.resultado.elegibilidade : null;
}
