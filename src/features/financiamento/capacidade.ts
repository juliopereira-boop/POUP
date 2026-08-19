/**
 * QUANTO CABE NA RENDA — a busca binária, num lugar só.
 *
 * ===========================================================================
 * POR QUE ISTO PRECISA DE BUSCA, E NÃO DE FÓRMULA
 * ===========================================================================
 * A pergunta é "qual o maior financiamento cuja primeira prestação cabe em
 * R$ X?". Se a prestação fosse só amortização e juros, haveria fórmula fechada
 * e acabou. Mas a prestação real inclui o **MIP**, que é uma taxa sobre o
 * SALDO DEVEDOR — ou seja, sobre o próprio valor que estamos procurando.
 *
 * A incógnita aparece dos dois lados. Não dá para isolar; dá para procurar.
 *
 * A bissecção resolve em ~60 passos com precisão de um centavo, e cada passo é
 * uma montagem de parcela — aritmética inteira, microssegundos. O custo é
 * irrelevante e a resposta é exata até o centavo.
 *
 * ===========================================================================
 * O CHUTE INICIAL É DE PROPÓSITO OTIMISTA
 * ===========================================================================
 * O limite superior sai da fórmula fechada, que **ignora os seguros** e por
 * isso devolve sempre um valor MAIOR que a resposta. Começar de um teto
 * garantidamente acima da resposta é o que impede a busca de cortar a solução
 * fora do intervalo — o erro clássico de bissecção mal semeada.
 *
 * ===========================================================================
 * ELE MORA AQUI, E NÃO DENTRO DE UM DOS DOIS
 * ===========================================================================
 * Duas telas fazem a mesma pergunta por caminhos opostos: o **poder de compra**
 * ("ganho X, compro o quê?") e agora a **entrada automática** do simulador
 * ("o banco empresta até quanto, e o que sobra é a poupança?"). Se cada uma
 * tivesse sua busca, as duas divergiriam no primeiro ajuste — e divergir aqui
 * significa dizer ao cliente dois valores diferentes para a mesma pergunta.
 */
import { principalParaPrestacao, type SistemaAmortizacao } from './amortizacao';
import { primeiraPrestacaoTotal } from './cronograma';
import { ZERO, centavos, subtrair, type Centavos, type PoliticaArredondamento } from './dinheiro';
import type { ProponenteResolvido } from './proponentes';
import type { RegrasSeguros } from './seguros';

/** Um centavo: abaixo disso, a diferença não existe em dinheiro. */
const TOLERANCIA: Centavos = centavos(1);

/**
 * 60 passos cobrem qualquer valor imaginável.
 *
 * Cada passo corta o intervalo pela metade; partindo de um teto na casa dos
 * bilhões, 60 divisões chegam a frações de centavo muito antes do fim. O limite
 * existe só para o laço não ser infinito se a tolerância nunca for atingida.
 */
const MAX_PASSOS = 60;

export interface EntradaCapacidade {
  /** O teto mensal: renda familiar × comprometimento máximo. */
  parcelaMaxima: Centavos;
  prazoMeses: number;
  sistema: SistemaAmortizacao;
  taxaMensal: number;
  correcaoMensal: number;
  carenciaMeses: number;
  /**
   * A base do DFI — o valor de AVALIAÇÃO do imóvel.
   *
   * Fixa, e não derivada do financiamento: aqui o imóvel já está escolhido e
   * avaliado. É o que diferencia esta busca da do poder de compra, onde o
   * imóvel ainda não existe e a avaliação acompanha o candidato.
   */
  valorAvaliacao: Centavos;
  proponentes: ProponenteResolvido[];
  seguros: RegrasSeguros;
  politica: PoliticaArredondamento;
}

/**
 * O maior financiamento cuja PRIMEIRA prestação cabe na parcela máxima.
 *
 * A primeira é a que decide porque é a maior: no SAC ela cai mês a mês, e no
 * PRICE o MIP cai junto com o saldo. Aprovar pela média reprovaria o cliente no
 * mês 1 — exatamente depois de ele já ter escolhido o apartamento.
 */
export function maiorFinanciamentoQueCabe(e: EntradaCapacidade): Centavos {
  if (e.parcelaMaxima <= 0 || e.prazoMeses <= 0) return ZERO;

  const prestacaoDe = (financiado: Centavos): Centavos =>
    primeiraPrestacaoTotal({
      financiado,
      prazoMeses: e.prazoMeses,
      sistema: e.sistema,
      taxaMensal: e.taxaMensal,
      correcaoMensal: e.correcaoMensal,
      carenciaMeses: e.carenciaMeses,
      valorAvaliacao: e.valorAvaliacao,
      proponentes: e.proponentes,
      seguros: e.seguros,
      politica: e.politica,
    }).total;

  const tetoTeorico = principalParaPrestacao(
    e.parcelaMaxima,
    e.taxaMensal,
    e.prazoMeses,
    e.sistema,
  );

  let baixo: Centavos = ZERO;
  let alto: Centavos = centavos(tetoTeorico + 1000);
  for (let i = 0; i < MAX_PASSOS && subtrair(alto, baixo) > TOLERANCIA; i++) {
    const meio = centavos((baixo + alto) / 2);
    if (prestacaoDe(meio) <= e.parcelaMaxima) baixo = meio;
    else alto = meio;
  }
  return baixo;
}
