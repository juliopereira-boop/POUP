/**
 * SAC E PRICE — as fórmulas fechadas.
 *
 * ===========================================================================
 * O QUE ESTE ARQUIVO É, E O QUE ELE NÃO É
 * ===========================================================================
 * Ele calcula a evolução de uma dívida: saldo, juros, amortização e prestação,
 * mês a mês. É matemática pura — **não sabe nada** sobre CAIXA, Minha Casa
 * Minha Vida, faixa de renda ou elegibilidade. Recebe principal, taxa mensal e
 * prazo; devolve a tabela.
 *
 * Essa separação não é preciosismo: as regras de negócio mudam por portaria, e
 * a matemática de amortização não muda nunca. Misturar as duas é como um
 * sistema desses envelhece.
 *
 * ===========================================================================
 * A DIFERENÇA ENTRE OS DOIS SISTEMAS, EM UMA FRASE CADA
 * ===========================================================================
 * **SAC** — a amortização é constante e a prestação CAI todo mês, porque os
 * juros incidem sobre um saldo que só diminui. Primeira parcela alta, última
 * baixa. Paga menos juros no total.
 *
 * **PRICE** — a prestação é constante e a composição é que muda: no começo
 * quase tudo é juros, no fim quase tudo é amortização. Primeira parcela menor
 * que a do SAC — e é por isso que ela às vezes é a única que cabe na renda.
 *
 * A CAIXA informa oficialmente trabalhar com SAC e com SFA/PRICE, e por isso os
 * dois estão aqui. Qual usar é decisão do produto e do cliente, não deste
 * arquivo.
 *
 * ===========================================================================
 * COMO A TABELA FECHA EM ZERO — sempre
 * ===========================================================================
 * O erro clássico deste domínio é a tabela que termina com R$ 0,02 de saldo
 * devedor. Acontece quando a amortização é calculada em ponto flutuante e
 * arredondada linha a linha sem ninguém checar a soma.
 *
 * Aqui há duas travas:
 *
 * 1. No SAC, as amortizações vêm de `ratear`, que **garante por construção**
 *    que a soma das partes é o principal, distribuindo o resto em centavos.
 * 2. Na PRICE, a ÚLTIMA parcela amortiza exatamente o saldo que restou, e a
 *    prestação dela é recalculada a partir disso. É o que os bancos fazem, e é
 *    o motivo de a última parcela de um PRICE real quase nunca ser idêntica às
 *    anteriores — costuma diferir por alguns centavos.
 *
 * Nos dois casos a garantia é verificada por teste automatizado
 * (`scripts/testar-financiamento.mjs`): saldo final exatamente zero, e soma das
 * amortizações exatamente igual ao principal.
 */
import { ZERO, aplicarTaxa, centavos, somar, type Centavos } from './dinheiro';

export type SistemaAmortizacao = 'SAC' | 'PRICE';

export const SISTEMA_ROTULO: Record<SistemaAmortizacao, string> = {
  SAC: 'SAC (parcela decrescente)',
  PRICE: 'PRICE (parcela fixa)',
};

/**
 * A prestação da PRICE: `P · i / (1 − (1+i)^−n)` — §22.
 *
 * Com taxa zero a fórmula divide por zero, então o caso é tratado à parte — e
 * ele acontece de verdade: há linha habitacional com juros subsidiados a zero.
 */
export function prestacaoPrice(
  principal: Centavos,
  taxaMensal: number,
  prazoMeses: number,
): Centavos {
  if (prazoMeses <= 0) return ZERO;
  if (taxaMensal <= 0) return centavos(principal / prazoMeses);
  const fator = taxaMensal / (1 - Math.pow(1 + taxaMensal, -prazoMeses));
  return centavos(principal * fator);
}

/**
 * Prazo necessário para caber numa prestação — o inverso da PRICE.
 *
 * `n = −ln(1 − P·i/PMT) / ln(1+i)`. Devolve `null` quando a prestação não paga
 * nem os juros do mês: nesse caso a dívida cresce para sempre e não existe
 * prazo que resolva. Devolver um número grande ali seria mentira confortável.
 */
export function prazoParaPrestacao(
  principal: Centavos,
  taxaMensal: number,
  prestacao: Centavos,
): number | null {
  if (principal <= 0 || prestacao <= 0) return null;
  if (taxaMensal <= 0) return Math.ceil(principal / prestacao);
  const jurosDoPrimeiroMes = principal * taxaMensal;
  if (prestacao <= jurosDoPrimeiroMes) return null;
  const n = -Math.log(1 - (principal * taxaMensal) / prestacao) / Math.log(1 + taxaMensal);
  return Math.ceil(n);
}

/**
 * Quanto se financia com uma prestação de X — o inverso do que mais importa
 * para o corretor.
 *
 * No PRICE é a fórmula da anuidade. No SAC a primeira parcela é a maior, então
 * é ELA que precisa caber: `PMT₁ = P/n + P·i` ⇒ `P = PMT₁ / (1/n + i)`. Usar a
 * média no SAC produziria um valor que estoura a renda logo no primeiro mês —
 * exatamente o erro que faz o financiamento ser negado depois de o cliente já
 * ter escolhido o apartamento.
 */
export function principalParaPrestacao(
  prestacao: Centavos,
  taxaMensal: number,
  prazoMeses: number,
  sistema: SistemaAmortizacao,
): Centavos {
  if (prestacao <= 0 || prazoMeses <= 0) return ZERO;
  if (sistema === 'SAC') {
    const divisor = 1 / prazoMeses + taxaMensal;
    return centavos(prestacao / divisor);
  }
  if (taxaMensal <= 0) return centavos(prestacao * prazoMeses);
  const fator = (1 - Math.pow(1 + taxaMensal, -prazoMeses)) / taxaMensal;
  return centavos(prestacao * fator);
}

/**
 * O ENCARGO PRINCIPAL da primeira parcela — sem seguros, sem tarifa.
 *
 * É a fórmula fechada, para quem precisa de um número rápido sem montar o
 * cronograma. A prestação COMPLETA, com MIP, DFI e tarifa, sai de
 * `primeiraPrestacaoTotal` em `cronograma.ts` — e é ela que vale para
 * comprometimento de renda e para o cálculo reverso.
 *
 * Manter as duas separadas é o §23 e o §32 na prática: encargo principal e
 * prestação total são coisas diferentes, e confundi-las subestima a parcela
 * exatamente no número que decide a venda.
 */
export function encargoPrincipalDaPrimeira(
  principal: Centavos,
  taxaMensal: number,
  prazoMeses: number,
  sistema: SistemaAmortizacao,
): Centavos {
  if (principal <= 0 || prazoMeses <= 0) return ZERO;
  if (sistema === 'PRICE') return prestacaoPrice(principal, taxaMensal, prazoMeses);
  const amortizacao = centavos(principal / prazoMeses);
  return somar(amortizacao, aplicarTaxa(principal, taxaMensal));
}
