/**
 * CÁLCULO REVERSO — a pergunta que o corretor realmente faz.
 *
 * ===========================================================================
 * O SIMULADOR DO BANCO RESPONDE A PERGUNTA ERRADA
 * ===========================================================================
 * O simulador de um banco pergunta o valor do imóvel e devolve a parcela. Só
 * que numa conversa de verdade ninguém começa pelo imóvel. Começa assim:
 *
 *     "Ganho R$ 5.000. Dá para comprar o quê?"
 *     "Consigo pagar R$ 1.500 por mês. Quanto financio?"
 *     "Tenho R$ 60 mil de entrada. Qual apartamento eu alcanço?"
 *
 * Responder isso é o que transforma o simulador em ferramenta de venda: o
 * corretor sai da pergunta com um NÚMERO e já aponta as unidades do estoque que
 * cabem nele.
 *
 * ===========================================================================
 * DOIS TETOS, E O MENOR MANDA
 * ===========================================================================
 * O poder de compra é limitado por duas coisas ao mesmo tempo, e quase todo
 * simulador esquece a segunda:
 *
 *   **A renda** limita a PARCELA, e a parcela limita o quanto se financia.
 *   **A entrada** limita o financiamento por outro caminho: se o banco só
 *   financia 80% do imóvel, os 20% restantes têm que sair do bolso. Com
 *   R$ 60 mil de entrada e quota de 80%, o imóvel não passa de R$ 300 mil —
 *   por mais que a renda aguentasse a parcela de um imóvel de R$ 500 mil.
 *
 * Algebricamente: com entrada `E` e quota `q`, o financiado `P` obedece
 * `P ≤ (P + E)·q`, ou seja `P ≤ E·q/(1−q)`. O motor calcula os dois tetos e
 * fica com o menor — e **diz qual dos dois travou**, que é a informação com
 * que o corretor age (buscar mais entrada, ou buscar mais renda compondo com
 * o cônjuge).
 *
 * ===========================================================================
 * O LAÇO DE PONTO FIXO
 * ===========================================================================
 * Se o MIP e o DFI estiverem cadastrados, existe uma circularidade: a parcela
 * inclui seguros, os seguros dependem do saldo devedor e do valor do imóvel, e
 * o valor do imóvel depende da parcela. Isso se resolve por aproximações
 * sucessivas — seis passadas bastam para o resultado parar de mudar em
 * centavos, e o laço é barato porque cada passada é aritmética pura.
 *
 * Sem os seguros cadastrados (que é o estado de fábrica), o laço converge na
 * primeira volta e o resultado é exato.
 */
import {
  ZERO,
  centavos,
  naoNegativo,
  percentualDe,
  reaisParaCentavos,
  somar,
  subtrair,
  taxaAnualParaMensal,
  type Centavos,
} from './dinheiro';
import {
  primeiraPrestacao,
  principalParaPrestacao,
  prazoParaPrestacao,
  type SistemaAmortizacao,
} from './amortizacao';
import { temValor, type ProdutoFinanciamento, type VersaoRegras } from './regras';

/** O que travou o poder de compra. */
export type Limitante = 'renda' | 'entrada' | 'teto_do_produto' | 'nada';

export const LIMITANTE_TEXTO: Record<Limitante, string> = {
  renda: 'A renda é o que limita: a parcela não pode passar do comprometimento máximo.',
  entrada:
    'A entrada é o que limita: o banco financia só parte do imóvel, e o resto precisa sair do bolso.',
  teto_do_produto: 'O teto de valor do imóvel desta linha é o que limita.',
  nada: 'Nada limitou dentro dos parâmetros informados.',
};

export interface EntradaPoderDeCompra {
  rendaFamiliarMensal: Centavos;
  entradaPropria: Centavos;
  fgts: Centavos;
  subsidio: Centavos;
  produto: ProdutoFinanciamento;
  regras: VersaoRegras;
  prazoMeses: number;
  sistema: SistemaAmortizacao;
  /** Obrigatórios quando o produto é de parâmetros manuais. */
  taxaAnualPctInformada?: number | null;
  quotaMaxPctInformada?: number | null;
  comprometimentoMaxPctInformado?: number | null;
}

export interface ResultadoPoderDeCompra {
  ok: boolean;
  erro: string | null;
  /** O maior imóvel alcançável. */
  valorImovelMax: Centavos;
  valorFinanciadoMax: Centavos;
  entradaTotal: Centavos;
  parcelaMaxima: Centavos;
  /** A primeira prestação do cenário no limite. */
  primeiraPrestacao: Centavos;
  limitante: Limitante;
  quotaAplicadaPct: number;
  taxaAnualPct: number;
  prazoMeses: number;
  sistema: SistemaAmortizacao;
  avisos: string[];
}

const PASSADAS_PONTO_FIXO = 6;

export function poderDeCompra(e: EntradaPoderDeCompra): ResultadoPoderDeCompra {
  const vazio: ResultadoPoderDeCompra = {
    ok: false,
    erro: null,
    valorImovelMax: ZERO,
    valorFinanciadoMax: ZERO,
    entradaTotal: ZERO,
    parcelaMaxima: ZERO,
    primeiraPrestacao: ZERO,
    limitante: 'nada',
    quotaAplicadaPct: 0,
    taxaAnualPct: 0,
    prazoMeses: e.prazoMeses,
    sistema: e.sistema,
    avisos: [],
  };

  const taxa = e.produto.parametrosManuais
    ? e.taxaAnualPctInformada
    : temValor(e.produto.taxaAnualPct)
      ? e.produto.taxaAnualPct.valor
      : null;
  if (taxa === null || taxa === undefined) {
    return { ...vazio, erro: 'A taxa desta linha não está cadastrada. Informe a taxa aprovada.' };
  }

  const quota = e.produto.parametrosManuais
    ? (e.quotaMaxPctInformada ?? null)
    : temValor(e.produto.quotaMaxPct)
      ? e.produto.quotaMaxPct.valor
      : null;
  if (quota === null) {
    return {
      ...vazio,
      erro: 'O percentual financiável desta linha não está cadastrado. Informe a quota aprovada.',
    };
  }

  const comprometimento = e.produto.parametrosManuais
    ? (e.comprometimentoMaxPctInformado ?? null)
    : temValor(e.produto.comprometimentoRendaMaxPct)
      ? e.produto.comprometimentoRendaMaxPct.valor
      : null;
  if (comprometimento === null || comprometimento <= 0) {
    return {
      ...vazio,
      erro: 'O comprometimento máximo de renda não está cadastrado nesta linha.',
    };
  }

  if (e.prazoMeses <= 0) return { ...vazio, erro: 'Informe o prazo em meses.' };

  const avisos: string[] = [];
  const taxaMensal = taxaAnualParaMensal(taxa, e.regras.conversaoTaxa);
  const entradaTotal = somar(
    naoNegativo(e.entradaPropria),
    naoNegativo(e.fgts),
    naoNegativo(e.subsidio),
  );
  const parcelaMaxima = percentualDe(e.rendaFamiliarMensal, comprometimento);

  if (parcelaMaxima <= 0) {
    return { ...vazio, entradaTotal, erro: 'Informe a renda familiar mensal.' };
  }

  /* ------------------------------------------------- teto vindo da RENDA */

  const enc = e.regras.encargos;
  const mipPct = temValor(enc.mipPctMensalSobreSaldo) ? enc.mipPctMensalSobreSaldo.valor : 0;
  const dfiPct = temValor(enc.dfiPctMensalSobreImovel) ? enc.dfiPctMensalSobreImovel.valor : 0;
  const tarifa = temValor(enc.tarifaAdminMensal) ? reaisParaCentavos(enc.tarifaAdminMensal.valor) : ZERO;
  if (!temValor(enc.mipPctMensalSobreSaldo) || !temValor(enc.dfiPctMensalSobreImovel)) {
    avisos.push(
      'Os seguros (MIP e DFI) ainda não estão cadastrados: o poder de compra abaixo considera só amortização e juros, e na prática a parcela será um pouco maior.',
    );
  }

  let financiadoPorRenda = principalParaPrestacao(
    subtrair(parcelaMaxima, tarifa),
    taxaMensal,
    e.prazoMeses,
    e.sistema,
  );
  for (let i = 0; i < PASSADAS_PONTO_FIXO && (mipPct > 0 || dfiPct > 0); i++) {
    const imovelEstimado = somar(financiadoPorRenda, entradaTotal);
    const acessorios = somar(
      percentualDe(financiadoPorRenda, mipPct),
      percentualDe(imovelEstimado, dfiPct),
      tarifa,
    );
    const disponivel = naoNegativo(subtrair(parcelaMaxima, acessorios));
    financiadoPorRenda = principalParaPrestacao(disponivel, taxaMensal, e.prazoMeses, e.sistema);
  }

  /* ----------------------------------------------- teto vindo da ENTRADA */

  const q = quota / 100;
  const financiadoPorEntrada: Centavos =
    q >= 1 ? (Number.MAX_SAFE_INTEGER as Centavos) : centavos((entradaTotal * q) / (1 - q));

  /* -------------------------------------------- teto vindo do PRODUTO */

  const tetoProduto =
    !e.produto.parametrosManuais &&
    temValor(e.produto.valorImovelMax) &&
    e.produto.valorImovelMax.valor > 0
      ? reaisParaCentavos(e.produto.valorImovelMax.valor)
      : null;

  /* --------------------------------------------------------- o menor manda */

  let financiado = (
    financiadoPorRenda < financiadoPorEntrada ? financiadoPorRenda : financiadoPorEntrada
  ) as Centavos;
  let limitante: Limitante = financiadoPorRenda <= financiadoPorEntrada ? 'renda' : 'entrada';

  let valorImovel = somar(financiado, entradaTotal);
  if (tetoProduto !== null && valorImovel > tetoProduto) {
    valorImovel = tetoProduto;
    financiado = naoNegativo(subtrair(valorImovel, entradaTotal));
    limitante = 'teto_do_produto';
  }

  const prestacao = somar(
    primeiraPrestacao(financiado, taxaMensal, e.prazoMeses, e.sistema),
    percentualDe(financiado, mipPct),
    percentualDe(valorImovel, dfiPct),
    tarifa,
  );

  return {
    ok: financiado > 0,
    erro:
      financiado > 0
        ? null
        : 'Com esta renda, esta entrada e este prazo, não sobra valor a financiar.',
    valorImovelMax: valorImovel,
    valorFinanciadoMax: financiado,
    entradaTotal,
    parcelaMaxima,
    primeiraPrestacao: prestacao,
    limitante,
    quotaAplicadaPct: valorImovel > 0 ? (financiado / valorImovel) * 100 : 0,
    taxaAnualPct: taxa,
    prazoMeses: e.prazoMeses,
    sistema: e.sistema,
    avisos,
  };
}

/* --------------------------------------------------------- reversos avulsos */

/**
 * "Consigo pagar R$ 1.500 por mês. Quanto financio?"
 *
 * Sem seguros na conta — eles dependem do imóvel, que é justamente o que ainda
 * não se sabe. Quem quiser a resposta completa usa `poderDeCompra`.
 */
export function financiamentoPorParcela(
  parcela: Centavos,
  taxaAnualPct: number,
  prazoMeses: number,
  sistema: SistemaAmortizacao,
  conversao: VersaoRegras['conversaoTaxa'],
): Centavos {
  const i = taxaAnualParaMensal(taxaAnualPct, conversao);
  return principalParaPrestacao(parcela, i, prazoMeses, sistema);
}

/**
 * "Tenho R$ 60 mil de entrada. Qual imóvel eu alcanço?"
 *
 * Só pela quota: `imóvel = entrada / (1 − q)`. É o teto da ENTRADA isolado —
 * a renda pode derrubá-lo, e é por isso que a tela sempre mostra os dois.
 */
export function imovelPorEntrada(entrada: Centavos, quotaMaxPct: number): Centavos {
  const q = quotaMaxPct / 100;
  if (q >= 1) return Number.MAX_SAFE_INTEGER as Centavos;
  if (entrada <= 0) return ZERO;
  return centavos(entrada / (1 - q));
}

/** "Este apartamento custa X. De quanto preciso de entrada?" */
export function entradaNecessaria(valorImovel: Centavos, quotaMaxPct: number): Centavos {
  const financiavel = percentualDe(valorImovel, Math.min(quotaMaxPct, 100));
  return naoNegativo(subtrair(valorImovel, financiavel));
}

/** "Financiando X e pagando Y por mês, em quanto tempo quita?" */
export function prazoPorParcela(
  financiado: Centavos,
  parcela: Centavos,
  taxaAnualPct: number,
  conversao: VersaoRegras['conversaoTaxa'],
): number | null {
  const i = taxaAnualParaMensal(taxaAnualPct, conversao);
  return prazoParaPrestacao(financiado, i, parcela);
}

/**
 * As unidades do estoque que cabem no poder de compra.
 *
 * É o remate comercial do módulo: em vez de "você pode financiar até R$ 240
 * mil", o corretor mostra as três unidades dele que servem. Genérico de
 * propósito — recebe qualquer coisa com preço, para servir tanto ao catálogo
 * de empreendimentos quanto a uma lista digitada na hora.
 */
export function unidadesCompativeis<T>(
  unidades: { item: T; valor: Centavos }[],
  valorImovelMax: Centavos,
  folgaPct = 0,
): { compativeis: T[]; quaseLa: { item: T; falta: Centavos }[] } {
  const limite = centavos(valorImovelMax * (1 + folgaPct / 100));
  const compativeis: T[] = [];
  const quaseLa: { item: T; falta: Centavos }[] = [];
  for (const u of unidades) {
    if (u.valor <= valorImovelMax) compativeis.push(u.item);
    else if (u.valor <= limite) quaseLa.push({ item: u.item, falta: subtrair(u.valor, valorImovelMax) });
  }
  return { compativeis, quaseLa };
}
