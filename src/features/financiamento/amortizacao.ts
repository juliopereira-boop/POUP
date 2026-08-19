/**
 * SAC E PRICE — a matemática que sustenta tudo.
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
import {
  ZERO,
  aplicarTaxa,
  centavos,
  ratear,
  somar,
  subtrair,
  type Centavos,
} from './dinheiro';

export type SistemaAmortizacao = 'SAC' | 'PRICE';

export const SISTEMA_ROTULO: Record<SistemaAmortizacao, string> = {
  SAC: 'SAC (parcela decrescente)',
  PRICE: 'PRICE (parcela fixa)',
};

export interface LinhaAmortizacao {
  /** 1 a N. */
  numero: number;
  saldoInicial: Centavos;
  juros: Centavos;
  amortizacao: Centavos;
  /**
   * Amortização + juros. É o ENCARGO PRINCIPAL, e não a prestação final.
   *
   * MIP, DFI e tarifa de administração entram por cima disso, em
   * `encargos.ts` — de propósito. Misturar seguro na tabela de amortização
   * esconderia o que é dívida e o que é acessório, e é justamente a distinção
   * que o cliente pergunta quando compara propostas.
   */
  encargoPrincipal: Centavos;
  saldoFinal: Centavos;
}

export interface TabelaAmortizacao {
  sistema: SistemaAmortizacao;
  principal: Centavos;
  taxaMensal: number;
  prazoMeses: number;
  linhas: LinhaAmortizacao[];
  totalJuros: Centavos;
  totalAmortizado: Centavos;
  /** Soma dos encargos principais. Sem seguros e sem tarifa. */
  totalEncargoPrincipal: Centavos;
  primeiroEncargoPrincipal: Centavos;
  ultimoEncargoPrincipal: Centavos;
}

export interface EntradaTabela {
  principal: Centavos;
  /** Fração ao mês. 0,0074 = 0,74% a.m. Zero é aceito. */
  taxaMensal: number;
  prazoMeses: number;
  sistema: SistemaAmortizacao;
}

/**
 * A prestação da PRICE: `P · i / (1 − (1+i)^−n)`.
 *
 * Com taxa zero a fórmula divide por zero, então o caso é tratado à parte — e
 * ele acontece de verdade: há linha habitacional com juros subsidiados a zero
 * para a faixa mais baixa.
 */
export function prestacaoPrice(principal: Centavos, taxaMensal: number, prazoMeses: number): Centavos {
  if (prazoMeses <= 0) return ZERO;
  if (taxaMensal <= 0) return centavos(principal / prazoMeses);
  const fator = taxaMensal / (1 - Math.pow(1 + taxaMensal, -prazoMeses));
  return centavos(principal * fator);
}

export function gerarTabela(entrada: EntradaTabela): TabelaAmortizacao {
  const { principal, taxaMensal, prazoMeses, sistema } = entrada;

  const vazia: TabelaAmortizacao = {
    sistema,
    principal,
    taxaMensal,
    prazoMeses,
    linhas: [],
    totalJuros: ZERO,
    totalAmortizado: ZERO,
    totalEncargoPrincipal: ZERO,
    primeiroEncargoPrincipal: ZERO,
    ultimoEncargoPrincipal: ZERO,
  };
  if (principal <= 0 || prazoMeses <= 0) return vazia;

  const linhas: LinhaAmortizacao[] =
    sistema === 'SAC'
      ? linhasSac(principal, taxaMensal, prazoMeses)
      : linhasPrice(principal, taxaMensal, prazoMeses);

  let totalJuros = ZERO;
  let totalAmortizado = ZERO;
  let totalEncargoPrincipal = ZERO;
  for (const l of linhas) {
    totalJuros = somar(totalJuros, l.juros);
    totalAmortizado = somar(totalAmortizado, l.amortizacao);
    totalEncargoPrincipal = somar(totalEncargoPrincipal, l.encargoPrincipal);
  }

  return {
    sistema,
    principal,
    taxaMensal,
    prazoMeses,
    linhas,
    totalJuros,
    totalAmortizado,
    totalEncargoPrincipal,
    primeiroEncargoPrincipal: linhas[0]?.encargoPrincipal ?? ZERO,
    ultimoEncargoPrincipal: linhas[linhas.length - 1]?.encargoPrincipal ?? ZERO,
  };
}

/**
 * SAC: amortização constante, prestação decrescente.
 *
 * As amortizações saem de `ratear`, então somam o principal ao centavo. Os
 * juros de cada mês são calculados sobre o saldo do início daquele mês e
 * arredondados ali mesmo — não se carrega fração de centavo adiante, porque o
 * boleto também não carrega.
 */
function linhasSac(principal: Centavos, taxaMensal: number, prazoMeses: number): LinhaAmortizacao[] {
  const amortizacoes = ratear(principal, prazoMeses);
  const linhas: LinhaAmortizacao[] = [];
  let saldo = principal;

  for (let i = 0; i < prazoMeses; i++) {
    const saldoInicial = saldo;
    const juros = aplicarTaxa(saldoInicial, taxaMensal);
    const amortizacao = amortizacoes[i]!;
    saldo = subtrair(saldoInicial, amortizacao);
    linhas.push({
      numero: i + 1,
      saldoInicial,
      juros,
      amortizacao,
      encargoPrincipal: somar(amortizacao, juros),
      saldoFinal: saldo,
    });
  }
  return linhas;
}

/**
 * PRICE: prestação constante, composição variável.
 *
 * A prestação é calculada uma vez e arredondada. A partir daí a tabela é
 * construída mês a mês — juros sobre o saldo, amortização é o que sobra da
 * prestação. Como a prestação foi arredondada, ao fim do prazo o saldo não cai
 * exatamente em zero; a diferença (uns poucos centavos, às vezes alguns reais
 * em prazos muito longos) é liquidada na ÚLTIMA parcela, que amortiza o saldo
 * remanescente inteiro.
 *
 * Não é gambiarra: é como o contrato funciona. A última prestação de um
 * financiamento PRICE real difere das anteriores exatamente por isso.
 *
 * Há ainda uma trava de segurança: se a prestação não cobrir nem os juros do
 * mês (taxa altíssima com prazo curtíssimo — combinação que não deveria passar
 * pelas regras, mas que não pode gerar tabela infinita), a amortização é
 * forçada a no mínimo zero e a última parcela absorve o saldo. Assim a função
 * sempre termina, e termina fechando.
 */
function linhasPrice(
  principal: Centavos,
  taxaMensal: number,
  prazoMeses: number,
): LinhaAmortizacao[] {
  const prestacao = prestacaoPrice(principal, taxaMensal, prazoMeses);
  const linhas: LinhaAmortizacao[] = [];
  let saldo = principal;

  for (let i = 0; i < prazoMeses; i++) {
    const saldoInicial = saldo;
    const juros = aplicarTaxa(saldoInicial, taxaMensal);
    const ultima = i === prazoMeses - 1;

    let amortizacao: Centavos;
    if (ultima) {
      amortizacao = saldoInicial;
    } else {
      const bruta = subtrair(prestacao, juros);
      // Nunca amortizar negativo (viraria saldo crescente e prazo infinito) nem
      // mais do que o saldo (viraria saldo negativo na penúltima linha).
      amortizacao = (bruta < 0 ? 0 : bruta > saldoInicial ? saldoInicial : bruta) as Centavos;
    }

    saldo = subtrair(saldoInicial, amortizacao);
    linhas.push({
      numero: i + 1,
      saldoInicial,
      juros,
      amortizacao,
      encargoPrincipal: somar(amortizacao, juros),
      saldoFinal: saldo,
    });
  }
  return linhas;
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
 * A primeira prestação (encargo principal) sem montar a tabela inteira.
 *
 * Existe para o comparador e para as buscas do cálculo reverso, que precisam
 * avaliar dezenas de cenários: gerar 420 linhas para ler só a primeira seria
 * desperdício que o corretor sente como travamento no celular.
 */
export function primeiraPrestacao(
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
