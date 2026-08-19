/**
 * CÁLCULO REVERSO — a pergunta que o corretor realmente faz.
 *
 * ===========================================================================
 * O SIMULADOR DO BANCO RESPONDE A PERGUNTA ERRADA
 * ===========================================================================
 * Ele pergunta o valor do imóvel e devolve a parcela. Numa conversa de verdade
 * ninguém começa pelo imóvel:
 *
 *     "Ganho R$ 5.000. Dá para comprar o quê?"
 *     "Consigo pagar R$ 1.500 por mês. Quanto financio?"
 *     "Tenho R$ 60 mil de entrada. Qual apartamento eu alcanço?"
 *
 * §39 e §40 dão o método: renda → prestação máxima → **retirar os encargos
 * acessórios** → resolver a função inversa.
 *
 * ===========================================================================
 * POR QUE BUSCA BINÁRIA, E NÃO A FÓRMULA FECHADA — §43 e §44
 * ===========================================================================
 * A fórmula fechada existe e está em `amortizacao.ts`. Ela basta quando a
 * parcela é só amortização + juros. Mas o MIP depende do SALDO DEVEDOR, que
 * depende do valor financiado — que é justamente o que estamos procurando. É
 * circular:
 *
 *     PMT_total = PMT_principal(PV) + MIP(PV) + DFI(imóvel) + tarifa
 *
 * §44 manda resolver por busca binária, e é o que este arquivo faz: chuta um
 * valor, monta a primeira prestação COMPLETA (com seguros), compara com o teto
 * e refina. Converge em ~40 passos até o centavo, e cada passo é aritmética —
 * roda instantâneo mesmo no celular.
 *
 * A busca binária ainda tem uma vantagem que a fórmula não tem: ela funciona
 * **sem alteração** quando um encargo novo entrar no cálculo. A fórmula fechada
 * teria que ser reescrita.
 *
 * ===========================================================================
 * DOIS TETOS, E O MENOR MANDA
 * ===========================================================================
 *   **A renda** limita a parcela, e a parcela limita o financiado.
 *   **A entrada** limita por outro caminho: com quota `q`, os `(1−q)` restantes
 *   saem do bolso, então `P ≤ E·q/(1−q)`. Com R$ 60 mil e quota de 80%, o imóvel
 *   não passa de R$ 300 mil — por mais que a renda aguentasse a parcela de um de
 *   R$ 500 mil.
 *
 * E a tela diz **qual dos dois travou**, porque a ação muda completamente:
 * travou na renda, compõe renda com o cônjuge; travou na entrada, negocia o ato
 * ou usa mais FGTS.
 */
import {
  ZERO,
  centavos,
  formatarBRL,
  naoNegativo,
  percentualDe,
  reaisParaCentavos,
  somar,
  subtrair,
  taxaMensalDe,
  type Centavos,
  type RegimeTaxa,
} from './dinheiro';
import {
  prazoParaPrestacao,
  principalParaPrestacao,
  type SistemaAmortizacao,
} from './amortizacao';
import { primeiraPrestacaoTotal } from './cronograma';
import { resolverCorrecao } from './indexador';
import { montarQuadro, type Proponente } from './proponentes';
import { acharIndexador, temValor, type ProdutoFinanciamento, type VersaoRegras } from './regras';

export type Limitante = 'renda' | 'entrada' | 'teto_do_produto' | 'nada';

export const LIMITANTE_TEXTO: Record<Limitante, string> = {
  renda: 'A renda é o que limita: a parcela não pode passar do comprometimento máximo.',
  entrada:
    'A entrada é o que limita: o banco financia só parte do imóvel, e o resto precisa sair do bolso.',
  teto_do_produto: 'O teto de valor do imóvel desta linha é o que limita.',
  nada: 'Nada limitou dentro dos parâmetros informados.',
};

export interface EntradaPoderDeCompra {
  proponentes: Proponente[];
  entradaPropria: Centavos;
  fgtsUsado: Centavos;
  subsidio: Centavos;
  produto: ProdutoFinanciamento;
  regras: VersaoRegras;
  prazoMeses: number;
  sistema: SistemaAmortizacao;
  cenarioIndexadorPct?: number | null;
  /** Obrigatórios quando o produto é de parâmetros manuais. */
  taxaAnualPctInformada?: number | null;
  regimeTaxaInformado?: RegimeTaxa | null;
  quotaMaxPctInformada?: number | null;
  comprometimentoMaxPctInformado?: number | null;
}

export interface ResultadoPoderDeCompra {
  ok: boolean;
  erro: string | null;
  valorImovelMax: Centavos;
  valorFinanciadoMax: Centavos;
  entradaTotal: Centavos;
  rendaFamiliarBruta: Centavos;
  parcelaMaxima: Centavos;
  /** A primeira prestação TOTAL do cenário no limite — com seguros. */
  primeiraPrestacao: Centavos;
  /** Quanto dos encargos acessórios já está dentro da parcela máxima. */
  acessoriosEstimados: Centavos | null;
  limitante: Limitante;
  quotaAplicadaPct: number;
  taxaAnualPct: number;
  regimeTaxa: RegimeTaxa;
  prazoMeses: number;
  sistema: SistemaAmortizacao;
  avisos: string[];
}

/** §44 — para quando a diferença deixa de importar. Um centavo. */
const TOLERANCIA: Centavos = centavos(1);
/** Teto de iterações. 60 passos cobrem de R$ 0 a R$ 1 bilhão até o centavo. */
const MAX_PASSOS = 60;

export function poderDeCompra(e: EntradaPoderDeCompra): ResultadoPoderDeCompra {
  const quadro = montarQuadro(e.proponentes);

  const vazio: ResultadoPoderDeCompra = {
    ok: false,
    erro: null,
    valorImovelMax: ZERO,
    valorFinanciadoMax: ZERO,
    entradaTotal: ZERO,
    rendaFamiliarBruta: quadro.rendaFamiliarBruta,
    parcelaMaxima: ZERO,
    primeiraPrestacao: ZERO,
    acessoriosEstimados: null,
    limitante: 'nada',
    quotaAplicadaPct: 0,
    taxaAnualPct: 0,
    regimeTaxa: 'nominal',
    prazoMeses: e.prazoMeses,
    sistema: e.sistema,
    avisos: [],
  };

  /* ------------------------------------------------------- os parâmetros */

  const regimeTaxa: RegimeTaxa = e.produto.parametrosManuais
    ? (e.regimeTaxaInformado ?? 'nominal')
    : e.produto.regimeTaxa;

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
    return { ...vazio, erro: 'O comprometimento máximo de renda não está cadastrado nesta linha.' };
  }

  if (e.prazoMeses <= 0) return { ...vazio, erro: 'Informe o prazo em meses.' };

  const parcelaMaxima = percentualDe(quadro.rendaFamiliarBruta, comprometimento);
  if (parcelaMaxima <= 0) {
    return { ...vazio, erro: 'Informe a renda dos proponentes.' };
  }

  const avisos: string[] = [];
  const taxaMensal = taxaMensalDe(taxa, regimeTaxa);
  const entradaTotal = somar(
    naoNegativo(e.entradaPropria),
    naoNegativo(e.fgtsUsado),
    naoNegativo(e.subsidio),
  );

  const idx = acharIndexador(e.regras, e.produto.indexadorId);
  const correcao = resolverCorrecao({
    indexador: idx,
    cenarioMensalPct: e.cenarioIndexadorPct ?? null,
  });
  if (correcao.origem === 'cenario') {
    avisos.push('Projeção: o índice usado é um cenário hipotético, não o índice observado.');
  }

  const semSeguros =
    !temValor(e.regras.seguros.mipPorIdade) ||
    !temValor(e.regras.seguros.dfiPctMensalSobreAvaliacao);
  if (semSeguros) {
    avisos.push(
      'Os seguros (MIP e DFI) não estão cadastrados: o poder de compra abaixo considera só amortização e juros, e a parcela real será maior.',
    );
  }

  /* -------------------------------------- o teto vindo da RENDA (busca) */

  const q = quota / 100;

  /**
   * A prestação total de um candidato a valor financiado.
   *
   * O imóvel correspondente é `financiado + entrada` — é ele que serve de base
   * ao DFI, que incide sobre a avaliação. Sem isso a busca subestimaria o DFI
   * exatamente nos cenários em que ele mais pesa.
   */
  const prestacaoDe = (financiado: Centavos): Centavos => {
    const imovel = somar(financiado, entradaTotal);
    return primeiraPrestacaoTotal({
      financiado,
      prazoMeses: e.prazoMeses,
      sistema: e.sistema,
      taxaMensal,
      correcaoMensal: correcao.taxaMensal,
      valorAvaliacao: imovel,
      proponentes: quadro.proponentes,
      seguros: e.regras.seguros,
      politica: e.regras.politicaArredondamento,
    }).total;
  };

  /*
   * O CHUTE INICIAL SAI DA FÓRMULA FECHADA.
   *
   * Ele ignora os seguros, então é sempre MAIOR que a resposta — o que o torna
   * um limite superior seguro para a busca. Começar de um limite superior
   * garantido é o que faz a bissecção convergir sem risco de cortar a resposta
   * fora do intervalo.
   */
  const tetoTeorico = principalParaPrestacao(parcelaMaxima, taxaMensal, e.prazoMeses, e.sistema);

  let baixo: Centavos = ZERO;
  let alto: Centavos = somar(tetoTeorico, centavos(1000));
  for (let i = 0; i < MAX_PASSOS && subtrair(alto, baixo) > TOLERANCIA; i++) {
    const meio = centavos((baixo + alto) / 2);
    if (prestacaoDe(meio) <= parcelaMaxima) baixo = meio;
    else alto = meio;
  }
  const financiadoPorRenda = baixo;

  /* ------------------------------------------ o teto vindo da ENTRADA */

  const financiadoPorEntrada: Centavos =
    q >= 1 ? (Number.MAX_SAFE_INTEGER as Centavos) : centavos((entradaTotal * q) / (1 - q));

  /* ------------------------------------------- o teto do PRODUTO */

  const tetoProduto =
    !e.produto.parametrosManuais &&
    temValor(e.produto.valorImovelMax) &&
    e.produto.valorImovelMax.valor > 0
      ? reaisParaCentavos(e.produto.valorImovelMax.valor)
      : null;

  /* ------------------------------------------------------ o menor manda */

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

  const prestacao = prestacaoDe(financiado);
  const detalhe = primeiraPrestacaoTotal({
    financiado,
    prazoMeses: e.prazoMeses,
    sistema: e.sistema,
    taxaMensal,
    correcaoMensal: correcao.taxaMensal,
    valorAvaliacao: valorImovel,
    proponentes: quadro.proponentes,
    seguros: e.regras.seguros,
    politica: e.regras.politicaArredondamento,
  });

  return {
    ok: financiado > 0,
    erro:
      financiado > 0
        ? null
        : `Com renda de ${formatarBRL(quadro.rendaFamiliarBruta)}, entrada de ${formatarBRL(entradaTotal)} e ${e.prazoMeses} meses, não sobra valor a financiar.`,
    valorImovelMax: valorImovel,
    valorFinanciadoMax: financiado,
    entradaTotal,
    rendaFamiliarBruta: quadro.rendaFamiliarBruta,
    parcelaMaxima,
    primeiraPrestacao: prestacao,
    acessoriosEstimados: detalhe.parcial
      ? null
      : subtrair(detalhe.total, detalhe.encargoPrincipal),
    limitante,
    quotaAplicadaPct: valorImovel > 0 ? (financiado / valorImovel) * 100 : 0,
    taxaAnualPct: taxa,
    regimeTaxa,
    prazoMeses: e.prazoMeses,
    sistema: e.sistema,
    avisos,
  };
}

/* --------------------------------------------------------- reversos avulsos */

/**
 * "Consigo pagar R$ 1.500 por mês. Quanto financio?" — §39 B.
 *
 * Sem seguros: eles dependem do imóvel, que é justamente o que ainda não se
 * sabe. Quem quiser a resposta completa usa `poderDeCompra`, que resolve a
 * circularidade por busca binária.
 */
export function financiamentoPorParcela(
  parcela: Centavos,
  taxaAnualPct: number,
  regime: RegimeTaxa,
  prazoMeses: number,
  sistema: SistemaAmortizacao,
): Centavos {
  return principalParaPrestacao(
    parcela,
    taxaMensalDe(taxaAnualPct, regime),
    prazoMeses,
    sistema,
  );
}

/** "Tenho R$ 60 mil de entrada. Qual imóvel alcanço?" — §39 C, só pela quota. */
export function imovelPorEntrada(entrada: Centavos, quotaMaxPct: number): Centavos {
  const q = quotaMaxPct / 100;
  if (q >= 1) return Number.MAX_SAFE_INTEGER as Centavos;
  if (entrada <= 0) return ZERO;
  return centavos(entrada / (1 - q));
}

/** "Este apartamento custa X. De quanto preciso de entrada?" */
export function entradaNecessaria(valorImovel: Centavos, quotaMaxPct: number): Centavos {
  return naoNegativo(subtrair(valorImovel, percentualDe(valorImovel, Math.min(quotaMaxPct, 100))));
}

/** "Financiando X e pagando Y por mês, em quanto tempo quita?" */
export function prazoPorParcela(
  financiado: Centavos,
  parcela: Centavos,
  taxaAnualPct: number,
  regime: RegimeTaxa,
): number | null {
  return prazoParaPrestacao(financiado, taxaMensalDe(taxaAnualPct, regime), parcela);
}

/**
 * As unidades do estoque que cabem no poder de compra — §35 do briefing.
 *
 * É o remate comercial: em vez de "você pode financiar até R$ 240 mil", o
 * corretor mostra as três unidades dele que servem. Genérico de propósito, para
 * servir tanto ao catálogo quanto a uma lista digitada na hora.
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
    else if (u.valor <= limite) {
      quaseLa.push({ item: u.item, falta: subtrair(u.valor, valorImovelMax) });
    }
  }
  return { compativeis, quaseLa };
}
