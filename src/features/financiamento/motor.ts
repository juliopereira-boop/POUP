/**
 * O MOTOR DE SIMULAÇÃO.
 *
 * ===========================================================================
 * ENTRA DADO, SAI RESULTADO. SÓ ISSO.
 * ===========================================================================
 * Uma função pura: nenhuma chamada de rede, nenhum acesso a banco, nenhum
 * componente de tela, nenhuma dependência do React. Recebe a entrada e a versão
 * de regras, devolve o resultado.
 *
 * Isso importa por três motivos práticos:
 *
 *   1. **Dá para testar de verdade.** `scripts/testar-financiamento.mjs` roda
 *      o motor inteiro em Node, sem simulador, sem navegador.
 *   2. **A LIA pode chamá-lo.** Quando ela precisar responder "quanto esse
 *      cliente consegue financiar?", ela chama ESTE motor e interpreta o
 *      resultado. O modelo de linguagem nunca faz a conta — ele só lê o número
 *      que a matemática produziu. É a diferença entre um assistente e um
 *      chute bem escrito.
 *   3. **Outro banco entra sem reescrever nada.** Ver `FinancingProvider` em
 *      `provider.ts`: este motor é a implementação interna; uma futura
 *      integração com a CAIXA seria outra implementação da mesma interface.
 *
 * ===========================================================================
 * A PRESTAÇÃO NÃO É "JUROS + AMORTIZAÇÃO"
 * ===========================================================================
 * A CAIXA informa que a prestação pode ter encargo principal (amortização +
 * juros) e encargos acessórios — MIP, DFI e tarifa de administração. O motor
 * modela os quatro separadamente e mostra a composição.
 *
 * Quando um encargo não tem parâmetro cadastrado, ele **não é chutado**: sai
 * `null`, a prestação é marcada como parcial e o resultado ganha uma entrada em
 * `naoCalculados` explicando o que falta. Uma prestação com um seguro inventado
 * é pior do que uma prestação assumidamente incompleta, porque a primeira o
 * corretor apresenta como definitiva.
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
  taxaAnualParaMensal,
  taxaMensalParaAnualEfetiva,
  type Centavos,
} from './dinheiro';
import {
  gerarTabela,
  type LinhaAmortizacao,
  type SistemaAmortizacao,
  type TabelaAmortizacao,
} from './amortizacao';
import { verificarElegibilidade, type ResultadoElegibilidade } from './elegibilidade';
import {
  acharIndexador,
  acharProduto,
  temValor,
  type ProdutoFinanciamento,
  type TipoImovel,
  type TipoOperacao,
  type VersaoRegras,
} from './regras';

/* ---------------------------------------------------------------- entrada */

export interface EntradaSimulacao {
  /* imóvel */
  operacao: TipoOperacao;
  tipoImovel: TipoImovel;
  uf: string | null;
  municipio: string | null;
  valorImovel: Centavos;

  /* recursos do cliente */
  entradaPropria: Centavos;
  fgts: Centavos;
  /** Subsídio/desconto informado. O motor não inventa subsídio. */
  subsidio: Centavos;

  /* cliente */
  rendaFamiliarMensal: Centavos;
  quantidadeProponentes: number;
  idadeAnos: number | null;

  /* condição */
  produtoId: string;
  sistema: SistemaAmortizacao;
  prazoMeses: number;

  /**
   * Só valem quando o produto é de parâmetros manuais ("Condições
   * informadas"). É o corretor repassando a condição que o correspondente
   * bancário aprovou para este cliente.
   */
  taxaAnualPctInformada?: number | null;
  quotaMaxPctInformada?: number | null;
  comprometimentoMaxPctInformado?: number | null;
}

/* ---------------------------------------------------------------- saída */

/** Um valor que o motor se recusou a inventar. */
export interface NaoCalculado {
  o_que: string;
  motivo: string;
}

export interface ComposicaoPrestacao {
  numero: number;
  amortizacao: Centavos;
  juros: Centavos;
  /** amortização + juros */
  encargoPrincipal: Centavos;
  /** `null` = parâmetro não cadastrado, e não zero. */
  mip: Centavos | null;
  dfi: Centavos | null;
  tarifa: Centavos | null;
  /** A soma do que existe. */
  total: Centavos;
  /** `true` quando algum encargo ficou de fora por falta de parâmetro. */
  parcial: boolean;
}

export type Confiabilidade = 'oficial' | 'estimativa' | 'informada';

export interface ResultadoSimulacao {
  /* procedência */
  versaoRegras: string;
  vigenciaRegras: string;
  confiabilidade: Confiabilidade;

  produto: { id: string; nome: string; parametrosManuais: boolean };
  indexador: { id: string; nome: string; correcaoAplicada: boolean };

  /* composição do negócio */
  valorImovel: Centavos;
  entradaPropria: Centavos;
  fgts: Centavos;
  subsidio: Centavos;
  entradaTotal: Centavos;
  valorFinanciado: Centavos;
  quotaAplicadaPct: number;

  /* condição */
  sistema: SistemaAmortizacao;
  prazoMeses: number;
  taxaAnualPct: number;
  taxaAnualEfetivaPct: number;
  taxaMensal: number;

  /* números que o corretor mostra */
  primeira: ComposicaoPrestacao;
  ultima: ComposicaoPrestacao;
  totalJuros: Centavos;
  /** Soma dos encargos principais. Sem seguros (que podem estar pendentes). */
  totalEncargoPrincipal: Centavos;
  /** Encargo principal + acessórios que deu para calcular. */
  totalPago: Centavos;
  /** `true` quando o total pago ficou incompleto por falta de parâmetro. */
  totalPagoParcial: boolean;
  rendaMinimaEstimada: Centavos | null;
  comprometimentoRendaPct: number | null;

  tabela: LinhaAmortizacao[];
  elegibilidade: ResultadoElegibilidade;
  naoCalculados: NaoCalculado[];
  avisos: string[];

  /**
   * As regras EXATAS que produziram este resultado, congeladas.
   *
   * É o que impede que mudar a taxa amanhã recalcule silenciosamente a
   * proposta de ontem. Vai gravado junto com a simulação.
   */
  snapshot: VersaoRegras;
}

export type SaidaSimulacao =
  | { ok: true; resultado: ResultadoSimulacao }
  | { ok: false; erro: string };

/* ---------------------------------------------------------------- motor */

export function simular(entrada: EntradaSimulacao, regras: VersaoRegras): SaidaSimulacao {
  const produto = acharProduto(regras, entrada.produtoId);
  if (!produto) return { ok: false, erro: 'Linha de financiamento não encontrada nas regras.' };
  if (entrada.prazoMeses <= 0) return { ok: false, erro: 'Informe o prazo em meses.' };
  if (entrada.valorImovel <= 0) return { ok: false, erro: 'Informe o valor do imóvel.' };

  const naoCalculados: NaoCalculado[] = [];
  const avisos: string[] = [];

  /* ------------------------------------------------------------ a taxa */

  const taxa = resolverTaxa(produto, entrada, naoCalculados);
  if (taxa === null) {
    return {
      ok: false,
      erro: `A taxa desta linha ainda não foi cadastrada. Use "Condições informadas" e digite a taxa aprovada pelo correspondente, ou cadastre a linha em Ajustes → Financiamento.`,
    };
  }
  const taxaMensal = taxaAnualParaMensal(taxa, regras.conversaoTaxa);

  /* --------------------------------------------------- o valor financiado */

  const entradaTotal = somar(
    naoNegativo(entrada.entradaPropria),
    naoNegativo(entrada.fgts),
    naoNegativo(entrada.subsidio),
  );
  const valorFinanciado = naoNegativo(subtrair(entrada.valorImovel, entradaTotal));
  const quotaAplicadaPct =
    entrada.valorImovel > 0 ? (valorFinanciado / entrada.valorImovel) * 100 : 0;

  if (valorFinanciado <= 0) {
    avisos.push('A entrada já cobre o imóvel inteiro: não há financiamento a simular.');
  }

  /* ---------------------------------------------------------- indexador */

  const indexador = acharIndexador(regras, produto.indexadorId);
  const projecao = indexador && temValor(indexador.projecaoMensal) ? indexador.projecaoMensal.valor : null;
  const correcaoAplicada = projecao !== null && projecao > 0;
  if (indexador && indexador.id !== 'FIXA' && !correcaoAplicada) {
    naoCalculados.push({
      o_que: `Correção monetária pelo ${indexador.nome}`,
      motivo:
        indexador.projecaoMensal.observacao ??
        'A projeção do indexador não está cadastrada. A tabela abaixo é SEM correção monetária.',
    });
    avisos.push(
      `A tabela não inclui correção pelo ${indexador.nome}: o saldo devedor de um contrato indexado sobe com o índice, e a projeção não está cadastrada.`,
    );
  }

  /* ------------------------------------------------------------- tabela */

  const tabela = gerarTabela({
    principal: valorFinanciado,
    taxaMensal,
    prazoMeses: entrada.prazoMeses,
    sistema: entrada.sistema,
  });

  /* ----------------------------------------------------------- encargos */

  const primeira = compor(tabela, 0, entrada.valorImovel, regras, naoCalculados);
  const ultima = compor(tabela, tabela.linhas.length - 1, entrada.valorImovel, regras, naoCalculados);
  const acessorios = totalAcessorios(tabela, entrada.valorImovel, regras);

  /* ------------------------------------------------------ renda e limites */

  const comprometimentoMaxPct = resolverComprometimento(produto, entrada);
  const quotaMaxPct = resolverQuota(produto, entrada);
  const prazoMaxMeses = temValor(produto.prazoMaxMeses) ? produto.prazoMaxMeses.valor : null;
  const comprometimentoRendaPct =
    entrada.rendaFamiliarMensal > 0 ? (primeira.total / entrada.rendaFamiliarMensal) * 100 : null;
  const rendaMinimaEstimada =
    comprometimentoMaxPct !== null && comprometimentoMaxPct > 0
      ? (Math.ceil((primeira.total * 100) / comprometimentoMaxPct) as Centavos)
      : null;

  if (rendaMinimaEstimada === null) {
    naoCalculados.push({
      o_que: 'Renda mínima estimada',
      motivo:
        'Depende do comprometimento máximo de renda, que ainda não foi cadastrado nesta linha.',
    });
  }

  /* ------------------------------------------------------ enquadramento */

  const elegibilidade = verificarElegibilidade({
    produto,
    regras,
    valorImovel: entrada.valorImovel,
    valorFinanciado,
    entradaTotal,
    rendaFamiliarMensal: entrada.rendaFamiliarMensal,
    primeiraPrestacao: primeira.total,
    prazoMeses: entrada.prazoMeses,
    idadeAnos: entrada.idadeAnos,
    usaFgts: entrada.fgts > 0,
    comprometimentoMaxPct,
    quotaMaxPct,
    prazoMaxMeses,
  });

  if (primeira.parcial) {
    avisos.push(
      'A prestação mostrada é o encargo principal (amortização + juros). Seguros e tarifa ainda não estão cadastrados e não foram somados.',
    );
  }

  return {
    ok: true,
    resultado: {
      versaoRegras: regras.versao,
      vigenciaRegras: regras.vigenciaInicio,
      confiabilidade: produto.parametrosManuais
        ? 'informada'
        : produto.taxaAnualPct.origem === 'oficial'
          ? 'oficial'
          : 'estimativa',

      produto: { id: produto.id, nome: produto.nome, parametrosManuais: produto.parametrosManuais },
      indexador: {
        id: indexador?.id ?? 'FIXA',
        nome: indexador?.nome ?? 'Taxa fixa',
        correcaoAplicada,
      },

      valorImovel: entrada.valorImovel,
      entradaPropria: naoNegativo(entrada.entradaPropria),
      fgts: naoNegativo(entrada.fgts),
      subsidio: naoNegativo(entrada.subsidio),
      entradaTotal,
      valorFinanciado,
      quotaAplicadaPct,

      sistema: entrada.sistema,
      prazoMeses: entrada.prazoMeses,
      taxaAnualPct: taxa,
      taxaAnualEfetivaPct: taxaMensalParaAnualEfetiva(taxaMensal),
      taxaMensal,

      primeira,
      ultima,
      totalJuros: tabela.totalJuros,
      totalEncargoPrincipal: tabela.totalEncargoPrincipal,
      totalPago: somar(tabela.totalEncargoPrincipal, acessorios.total),
      totalPagoParcial: acessorios.parcial,
      rendaMinimaEstimada,
      comprometimentoRendaPct,

      tabela: tabela.linhas,
      elegibilidade,
      naoCalculados,
      avisos,
      snapshot: regras,
    },
  };
}

/* ------------------------------------------------------------- auxiliares */

/**
 * Qual taxa vale: a informada pelo corretor ou a cadastrada na linha.
 *
 * A informada só é aceita em produto de parâmetros manuais. Deixar o corretor
 * sobrescrever a taxa de uma linha oficial transformaria "MCMV Faixa 2" numa
 * etiqueta sem significado — e o PDF sairia com o nome do programa e um número
 * que não é do programa.
 */
function resolverTaxa(
  produto: ProdutoFinanciamento,
  entrada: EntradaSimulacao,
  naoCalculados: NaoCalculado[],
): number | null {
  if (produto.parametrosManuais) {
    const informada = entrada.taxaAnualPctInformada;
    if (informada === null || informada === undefined || !Number.isFinite(informada)) {
      naoCalculados.push({
        o_que: 'Taxa de juros',
        motivo: 'Informe a taxa ao ano que o correspondente bancário aprovou para este cliente.',
      });
      return null;
    }
    return Math.max(0, informada);
  }
  return temValor(produto.taxaAnualPct) ? produto.taxaAnualPct.valor : null;
}

/**
 * A quota que vale: a informada ou a cadastrada.
 *
 * Mesma regra da taxa — só produto de parâmetros manuais aceita a informada.
 * Sem esta resolução, "Condições informadas" caía nos 100% do cadastro e
 * aprovava financiamento sem entrada nenhuma, ignorando os 80% que o corretor
 * tinha digitado.
 */
function resolverQuota(produto: ProdutoFinanciamento, entrada: EntradaSimulacao): number | null {
  if (produto.parametrosManuais) {
    const informada = entrada.quotaMaxPctInformada;
    if (typeof informada === 'number' && informada > 0) return informada;
  }
  return temValor(produto.quotaMaxPct) ? produto.quotaMaxPct.valor : null;
}

function resolverComprometimento(
  produto: ProdutoFinanciamento,
  entrada: EntradaSimulacao,
): number | null {
  if (produto.parametrosManuais) {
    const informado = entrada.comprometimentoMaxPctInformado;
    if (typeof informado === 'number' && informado > 0) return informado;
  }
  return temValor(produto.comprometimentoRendaMaxPct)
    ? produto.comprometimentoRendaMaxPct.valor
    : null;
}

/**
 * A composição de UMA prestação: encargo principal + acessórios.
 *
 * MIP incide sobre o saldo devedor daquele mês (por isso cai ao longo do
 * contrato); DFI incide sobre o valor do imóvel (por isso é constante); a
 * tarifa é fixa. Encargo sem parâmetro cadastrado vira `null` — nunca zero,
 * porque zero é uma afirmação ("não custa nada") e `null` é a verdade ("não
 * sei quanto custa").
 */
function compor(
  tabela: TabelaAmortizacao,
  indice: number,
  valorImovel: Centavos,
  regras: VersaoRegras,
  naoCalculados: NaoCalculado[],
): ComposicaoPrestacao {
  const linha = tabela.linhas[indice];
  if (!linha) {
    return {
      numero: 0,
      amortizacao: ZERO,
      juros: ZERO,
      encargoPrincipal: ZERO,
      mip: null,
      dfi: null,
      tarifa: null,
      total: ZERO,
      parcial: true,
    };
  }

  const e = regras.encargos;

  const mip = temValor(e.mipPctMensalSobreSaldo)
    ? percentualDe(linha.saldoInicial, e.mipPctMensalSobreSaldo.valor)
    : null;
  const dfi = temValor(e.dfiPctMensalSobreImovel)
    ? percentualDe(valorImovel, e.dfiPctMensalSobreImovel.valor)
    : null;
  const tarifa = temValor(e.tarifaAdminMensal) ? reaisParaCentavos(e.tarifaAdminMensal.valor) : null;

  // Registra o que faltou — uma vez só, e não uma vez por parcela.
  const registrar = (o_que: string, param: { observacao: string | null }) => {
    if (naoCalculados.some((n) => n.o_que === o_que)) return;
    naoCalculados.push({ o_que, motivo: param.observacao ?? 'Parâmetro não cadastrado.' });
  };
  if (mip === null) registrar('MIP (seguro de morte e invalidez)', e.mipPctMensalSobreSaldo);
  if (dfi === null) registrar('DFI (seguro de danos ao imóvel)', e.dfiPctMensalSobreImovel);
  if (tarifa === null) registrar('Tarifa de administração', e.tarifaAdminMensal);

  const total = somar(linha.encargoPrincipal, mip ?? ZERO, dfi ?? ZERO, tarifa ?? ZERO);

  return {
    numero: linha.numero,
    amortizacao: linha.amortizacao,
    juros: linha.juros,
    encargoPrincipal: linha.encargoPrincipal,
    mip,
    dfi,
    tarifa,
    total,
    parcial: mip === null || dfi === null || tarifa === null,
  };
}

/**
 * O texto obrigatório do rodapé.
 *
 * Fica no motor, e não na tela, porque toda saída — dashboard, PDF, link
 * compartilhado, resposta da LIA — precisa carregá-lo. Deixar isso a cargo de
 * cada tela é garantir que uma delas esqueça, e é justamente a que vai parar
 * na mão do cliente.
 */
export const AVISO_LEGAL =
  'Simulação estimada, gerada pelo POUP a partir dos dados informados. Não é proposta de crédito nem garantia de aprovação. As condições finais — taxa, prazo, seguros, tarifas e enquadramento — dependem de análise da instituição financeira.';

/** Resumo de uma linha, para lista e para o comparador. */
export function resumoDaSimulacao(r: ResultadoSimulacao): string {
  return `${formatarBRL(r.valorFinanciado)} em ${r.prazoMeses}x · ${r.sistema} · 1ª de ${formatarBRL(r.primeira.total)}`;
}

/**
 * Soma dos encargos acessórios ao longo do contrato inteiro.
 *
 * `null` quando falta parâmetro — e aí o "total pago" também sai parcial, com
 * o resultado dizendo isso. O MIP acompanha o saldo devedor, então é somado
 * linha a linha; o DFI e a tarifa são constantes e saem por multiplicação.
 */
function totalAcessorios(
  tabela: TabelaAmortizacao,
  valorImovel: Centavos,
  regras: VersaoRegras,
): { total: Centavos; parcial: boolean } {
  const e = regras.encargos;
  let total = ZERO;
  let parcial = false;

  if (temValor(e.mipPctMensalSobreSaldo)) {
    for (const l of tabela.linhas) {
      total = somar(total, percentualDe(l.saldoInicial, e.mipPctMensalSobreSaldo.valor));
    }
  } else parcial = true;

  if (temValor(e.dfiPctMensalSobreImovel)) {
    const mensal = percentualDe(valorImovel, e.dfiPctMensalSobreImovel.valor);
    total = somar(total, centavos(mensal * tabela.linhas.length));
  } else parcial = true;

  if (temValor(e.tarifaAdminMensal)) {
    const mensal = reaisParaCentavos(e.tarifaAdminMensal.valor);
    total = somar(total, centavos(mensal * tabela.linhas.length));
  } else parcial = true;

  return { total, parcial };
}
