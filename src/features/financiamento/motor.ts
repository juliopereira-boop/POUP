/**
 * O MOTOR DE SIMULAÇÃO — o pipeline inteiro.
 *
 * ===========================================================================
 * A ARQUITETURA É A DO §3 E DO §121
 * ===========================================================================
 *     DADOS → REGRAS → ENQUADRAMENTO → CÁLCULO → VALIDAÇÃO → RESULTADO
 *
 * E nunca:
 *
 *     DADOS → FÓRMULA ÚNICA → PARCELA
 *
 * Por isso o motor é uma orquestração de módulos com uma responsabilidade cada
 * — `indexador.ts`, `seguros.ts`, `proponentes.ts`, `cronograma.ts`,
 * `elegibilidade.ts` — e não um arquivo que faz tudo. Trocar a apólice do MIP
 * não pode obrigar ninguém a mexer no laço de amortização.
 *
 * ===========================================================================
 * FUNÇÃO PURA — sem React, sem rede, sem banco
 * ===========================================================================
 *   1. Os testes rodam em Node puro (`npm run testar:financiamento`).
 *   2. A LIA pode CHAMÁ-LO em vez de calcular por conta própria (§36 do
 *      briefing original): o modelo interpreta o número, nunca o produz.
 *   3. Um provedor de banco entra como outra implementação de
 *      `FinancingProvider` sem tela nenhuma mudar.
 *
 * ===========================================================================
 * TRÊS COISAS QUE ESTE MOTOR SE RECUSA A FAZER
 * ===========================================================================
 *   - **Inventar parâmetro** (§74, §75). Faltou, sai `null` e entra em
 *     `naoCalculados` com o motivo.
 *   - **Dizer "aprovado"** (§96). O vocabulário é *enquadramento estimado*, e o
 *     aviso legal viaja no resultado, não em cada tela.
 *   - **Misturar simulação com projeção** (§111). Cenário de indexador escolhido
 *     pelo corretor marca o resultado inteiro como projeção.
 */
import {
  ZERO,
  centavosParaReais,
  efetivaAnualDe,
  formatarBRL,
  formatarPct,
  formatarPrazo,
  maior,
  menor,
  naoNegativo,
  percentualDe,
  reaisParaCentavos,
  somar,
  subtrair,
  taxaMensalDe,
  type Centavos,
  type RegimeTaxa,
} from './dinheiro';
import type { SistemaAmortizacao } from './amortizacao';
import { gerarCronograma, type Cronograma, type ParcelaCronograma } from './cronograma';
import { resolverCorrecao, type CorrecaoAplicada } from './indexador';
import { montarQuadro, type Proponente, type QuadroDeProponentes } from './proponentes';
import { verificarElegibilidade, type ResultadoElegibilidade } from './elegibilidade';
import {
  BASE_COMPROMETIMENTO_ROTULO,
  acharIndexador,
  acharProduto,
  classificarSfh,
  confiabilidadeDaVersao,
  entradaMinimaEfetivaPct,
  temValor,
  type BaseComprometimento,
  type Enquadramento,
  type ProdutoFinanciamento,
  type StatusConfiabilidade,
  type TipoImovel,
  type TipoOperacao,
  type VersaoRegras,
} from './regras';

/**
 * A prestação que vale para o teste de comprometimento de renda.
 *
 * As três bases são as do cadastro (`BaseComprometimento`). Quando um
 * componente da base escolhida não está cadastrado — DFI sem apólice, por
 * exemplo —, o que sobra é somado assim mesmo: o número fica menor que o real,
 * e é justamente por isso que o resultado carrega o aviso de parcial. Fingir
 * que o componente vale zero seria mentir; recusar-se a calcular deixaria o
 * corretor sem nada.
 */
function prestacaoDaBase(base: BaseComprometimento, crono: Cronograma): Centavos {
  const p = crono.primeira;
  if (!p) return ZERO;
  if (base === 'principal_juros') return p.encargoPrincipal;
  if (base === 'principal_juros_dfi') {
    return (p.encargoPrincipal + (p.dfi ?? 0)) as Centavos;
  }
  return p.prestacaoTotal;
}

/* ---------------------------------------------------------------- entrada */

export interface EntradaSimulacao {
  /* --- imóvel --- */
  operacao: TipoOperacao;
  tipoImovel: TipoImovel;
  uf: string | null;
  municipio: string | null;
  /** Preço de venda negociado. */
  valorImovel: Centavos;
  /**
   * Valor de AVALIAÇÃO do imóvel — §8.
   *
   * "Não assumir automaticamente que valor financiável = preço de venda." A
   * base do financiamento é o MENOR entre venda e avaliação, e o DFI incide
   * sobre a avaliação. Zero = não informada, e aí a venda vale para os dois.
   */
  valorAvaliacao: Centavos;

  /* --- recursos --- */
  entradaPropria: Centavos;
  fgtsDisponivel: Centavos;
  /** Quanto do FGTS será usado. Nunca maior que o disponível (§10). */
  fgtsUsado: Centavos;
  subsidio: Centavos;

  /* --- cliente --- */
  proponentes: Proponente[];

  /* --- condição --- */
  /**
   * O banco escolhido na porta do simulador.
   *
   * Vem separado de `produtoId` porque a linha "Condições informadas" serve a
   * qualquer instituição: sem este campo, uma simulação feita no Itaú com
   * condição informada não teria como dizer que foi no Itaú.
   */
  bancoId?: string | null;
  produtoId: string;
  sistema: SistemaAmortizacao;
  prazoMeses: number;
  carenciaMeses: number;
  /** Cenário hipotético para o indexador, em % ao mês. `null` = usar o cadastro. */
  cenarioIndexadorPct?: number | null;

  /** Só valem em produto de parâmetros manuais. */
  taxaAnualPctInformada?: number | null;
  regimeTaxaInformado?: RegimeTaxa | null;
  quotaMaxPctInformada?: number | null;
  comprometimentoMaxPctInformado?: number | null;
}

/* ------------------------------------------------------------------ saída */

/** Um valor que o motor se recusou a inventar. */
export interface NaoCalculado {
  o_que: string;
  motivo: string;
}

/** §95 e §120 — a classificação de confiabilidade do resultado. */
export type StatusCalculo =
  | 'OFICIAL'
  | 'ESTIMADO'
  | 'INFORMADO'
  | 'PROJECAO'
  | 'SEM_CORRECAO'
  | 'REQUER_VALIDACAO';

export const STATUS_ROTULO: Record<StatusCalculo, string> = {
  OFICIAL: 'Condições oficiais cadastradas',
  ESTIMADO: 'Estimativa calculada',
  INFORMADO: 'Condição informada pelo corretor',
  PROJECAO: 'Projeção — cenário hipotético',
  SEM_CORRECAO: 'Calculada sem a correção monetária',
  REQUER_VALIDACAO: 'Requer validação da instituição',
};

/**
 * O QUE ENTROU E O QUE FICOU DE FORA DESTE NÚMERO.
 *
 * Um resultado não é só um valor: é um valor mais a lista honesta do que ele
 * contém. Quando a tábua do MIP não está cadastrada, a prestação sai **menor
 * que a real** — e o corretor precisa saber disso antes de mostrar ao cliente,
 * não depois de o banco apresentar a proposta.
 *
 * Daí duas listas em português, prontas para a tela e para o PDF, e os
 * booleanos para quem precisa decidir por código.
 */
export interface ComponentesDoCalculo {
  incluidos: string[];
  naoIncluidos: string[];
  mipIncluido: boolean;
  dfiIncluido: boolean;
  tarifaIncluida: boolean;
  /** A linha usa indexador E ele foi aplicado (observado ou cenário). */
  correcaoAplicada: boolean;
}

/** §69 — "como o sistema chegou a este valor?". Uma linha por etapa. */
export interface PassoTrace {
  etapa: string;
  valor: string;
  detalhe: string;
}

export interface ResultadoSimulacao {
  /* --- procedência --- */
  versaoRegras: string;
  vigenciaRegras: string;
  status: StatusCalculo;
  /**
   * A versão de regras pode ser apresentada como oficial?
   *
   * Independe do status acima: uma condição pode ser calculável e completa e
   * ainda assim vir de uma versão sem fonte registrada. Digitar números não
   * torna nada oficial.
   */
  confiabilidade: StatusConfiabilidade;
  /** O que entrou e o que ficou de fora desta prestação. */
  componentes: ComponentesDoCalculo;
  /**
   * A linha usada, e de qual banco ela é.
   *
   * `bancoId` viaja com o resultado porque o PDF e o histórico precisam dizer
   * em qual instituição a simulação foi feita — e o snapshot de regras, que é o
   * que congela a condição, não guarda a escolha do corretor.
   */
  produto: { id: string; nome: string; parametrosManuais: boolean; bancoId: string | null };
  enquadramentoSfh: Enquadramento;

  /* --- indexador --- */
  indexador: { id: string; nome: string };
  correcao: CorrecaoAplicada;

  /* --- composição do negócio --- */
  valorImovel: Centavos;
  valorAvaliacao: Centavos;
  /** MIN(venda, avaliação) — a base de tudo (§8). */
  valorBase: Centavos;
  entradaPropria: Centavos;
  fgtsUsado: Centavos;
  subsidio: Centavos;
  entradaTotal: Centavos;
  valorFinanciado: Centavos;
  quotaAplicadaPct: number;
  /** §12 — qual restrição definiu o valor financiado. */
  restricaoQueMandou: string;

  /* --- condição --- */
  sistema: SistemaAmortizacao;
  prazoMeses: number;
  carenciaMeses: number;
  taxaAnualPct: number;
  regimeTaxa: RegimeTaxa;
  taxaAnualEfetivaPct: number;
  taxaMensal: number;

  /* --- os números --- */
  primeira: ParcelaCronograma | null;
  ultima: ParcelaCronograma | null;
  totalJuros: Centavos;
  totalAmortizado: Centavos;
  totalCorrecao: Centavos;
  totalEncargoPrincipal: Centavos;
  totalSeguros: Centavos | null;
  totalTarifas: Centavos | null;
  totalPago: Centavos;
  totalPagoParcial: boolean;

  rendaFamiliarBruta: Centavos;
  comprometimentoMaximo: Centavos | null;
  rendaMinimaEstimada: Centavos | null;
  comprometimentoRendaPct: number | null;

  /**
   * §64 — o CET tem campo, e NÃO é calculado.
   *
   * Calcular o Custo Efetivo Total exige todos os componentes contratuais
   * (tarifas de contratação, avaliação, registro, seguros efetivos). Sem eles,
   * qualquer número seria um CET falso — e CET falso é o tipo de informação que
   * o cliente usa para comparar bancos.
   */
  cet: null;

  tabela: ParcelaCronograma[];
  elegibilidade: ResultadoElegibilidade;
  naoCalculados: NaoCalculado[];
  avisos: string[];
  trace: PassoTrace[];

  /** As regras EXATAS que produziram este resultado, congeladas (§68). */
  snapshot: VersaoRegras;
}

export type SaidaSimulacao =
  | { ok: true; resultado: ResultadoSimulacao }
  | { ok: false; erro: string };

/* ------------------------------------------------------------------ motor */

export function simular(entrada: EntradaSimulacao, regras: VersaoRegras): SaidaSimulacao {
  const produto = acharProduto(regras, entrada.produtoId);
  if (!produto) return { ok: false, erro: 'Linha de financiamento não encontrada nas regras.' };
  if (entrada.prazoMeses <= 0) return { ok: false, erro: 'Informe o prazo em meses.' };
  if (entrada.valorImovel <= 0) return { ok: false, erro: 'Informe o valor do imóvel.' };

  const naoCalculados: NaoCalculado[] = [];
  const avisos: string[] = [];
  const trace: PassoTrace[] = [];
  const passo = (etapa: string, valor: string, detalhe = '') =>
    void trace.push({ etapa, valor, detalhe });

  /* ---------------------------------------------------- 1. os proponentes */

  const quadro = montarQuadro(entrada.proponentes);
  if (quadro.participacaoNormalizada) {
    avisos.push(
      'Os percentuais de pactuação de renda não somavam 100% e foram normalizados proporcionalmente.',
    );
  }
  passo(
    'Proponentes',
    `${quadro.proponentes.length}`,
    quadro.proponentes
      .map(
        (p) =>
          `${p.nome || 'sem nome'}: ${formatarBRL(p.rendaBruta)} (${p.participacaoEfetivaPct.toFixed(2)}%)`,
      )
      .join(' · ') || 'nenhum informado',
  );
  passo('Renda familiar bruta', formatarBRL(quadro.rendaFamiliarBruta));

  /* ------------------------------------------- 2. o valor base do imóvel */

  /*
   * §8: "o sistema deverá trabalhar com o menor valor". Sem avaliação
   * informada, a venda vale para os dois — mas a tela avisa, porque a
   * avaliação do banco costuma vir ABAIXO do preço negociado, e é ela que
   * define quanto entra de financiamento.
   */
  const avaliacao = entrada.valorAvaliacao > 0 ? entrada.valorAvaliacao : entrada.valorImovel;
  const valorBase = menor(entrada.valorImovel, avaliacao);
  if (entrada.valorAvaliacao <= 0) {
    avisos.push(
      'Sem o valor de avaliação, a conta usa o preço de venda. A avaliação do banco costuma vir abaixo do preço negociado — e é ela que limita o financiamento.',
    );
  } else if (avaliacao < entrada.valorImovel) {
    avisos.push(
      `A avaliação (${formatarBRL(avaliacao)}) é menor que o preço de venda (${formatarBRL(entrada.valorImovel)}). O financiamento é calculado sobre a avaliação, e a diferença sai do bolso do cliente.`,
    );
  }
  passo(
    'Valor base',
    formatarBRL(valorBase),
    `MIN(venda ${formatarBRL(entrada.valorImovel)}, avaliação ${formatarBRL(avaliacao)})`,
  );

  /* --------------------------------------------------- 3. SFH ou SFI */

  const { enquadramento, limite } = classificarSfh(regras, centavosParaReais(avaliacao));
  passo(
    'Enquadramento',
    enquadramento,
    limite === null
      ? 'Limite SFH não cadastrado'
      : `Limite SFH: ${formatarBRL(reaisParaCentavos(limite))}`,
  );
  if (enquadramento === 'indefinido') {
    naoCalculados.push({
      o_que: 'Enquadramento SFH/SFI',
      motivo:
        regras.sfh.limiteValorImovel.observacao ?? 'O limite de enquadramento não está cadastrado.',
    });
  }

  /* ----------------------------------------------------------- 4. o FGTS */

  /*
   * §10: "nunca permitir fgtsUsed > fgtsAvailable". O motor CORTA em vez de
   * recusar — recusar a simulação inteira por causa de um campo mal digitado
   * seria hostil no meio de um atendimento —, mas o corte aparece em aviso.
   */
  let fgtsUsado = naoNegativo(entrada.fgtsUsado);
  const fgtsDisponivel = naoNegativo(entrada.fgtsDisponivel);
  if (fgtsDisponivel > 0 && fgtsUsado > fgtsDisponivel) {
    avisos.push(
      `O FGTS usado (${formatarBRL(fgtsUsado)}) passava do saldo informado (${formatarBRL(fgtsDisponivel)}) e foi limitado ao saldo.`,
    );
    fgtsUsado = fgtsDisponivel;
  }
  const fgtsPermitido = temValor(regras.fgts.permitidoNaEntrada)
    ? regras.fgts.permitidoNaEntrada.valor
    : null;
  if (fgtsUsado > 0 && fgtsPermitido === false) {
    avisos.push('As regras cadastradas não permitem FGTS nesta operação.');
    fgtsUsado = ZERO;
  }

  const entradaTotal = somar(naoNegativo(entrada.entradaPropria), fgtsUsado, naoNegativo(entrada.subsidio));
  passo(
    'Entrada total',
    formatarBRL(entradaTotal),
    `próprio ${formatarBRL(entrada.entradaPropria)} + FGTS ${formatarBRL(fgtsUsado)} + subsídio ${formatarBRL(entrada.subsidio)}`,
  );

  /* ------------------------------------------- 5. a taxa e o regime dela */

  const regimeTaxa: RegimeTaxa = produto.parametrosManuais
    ? (entrada.regimeTaxaInformado ?? 'nominal')
    : produto.regimeTaxa;

  const taxa = resolverTaxa(produto, entrada);
  if (taxa === null) {
    return {
      ok: false,
      erro: produto.parametrosManuais
        ? 'Informe a taxa ao ano que o correspondente bancário aprovou para este cliente.'
        : `A taxa da linha "${produto.nome}" ainda não foi cadastrada. Use "Condições informadas" e digite a taxa aprovada, ou cadastre a linha em Ajustes → Financiamento.`,
    };
  }
  const taxaMensal = taxaMensalDe(taxa, regimeTaxa);
  passo(
    'Taxa',
    `${formatarPct(taxa)} a.a. ${regimeTaxa}`,
    `→ ${(taxaMensal * 100).toFixed(6).replace('.', ',')}% a.m. · efetiva anual ${formatarPct(efetivaAnualDe(taxa, regimeTaxa))}`,
  );

  /* --------------------------------------------------- 6. o valor financiado */

  const necessarioAposEntrada = naoNegativo(subtrair(valorBase, entradaTotal));
  const restricoes = calcularRestricoes({
    produto,
    entrada,
    valorBase,
    entradaTotal,
    quadro,
    taxaMensal,
    regras,
  });
  const valorFinanciado = restricoes.valor;
  const quotaAplicadaPct = valorBase > 0 ? (valorFinanciado / valorBase) * 100 : 0;

  passo(
    'Valor financiado',
    formatarBRL(valorFinanciado),
    `MIN(${restricoes.detalhe})`,
  );

  if (valorFinanciado <= 0) {
    avisos.push('A entrada já cobre o imóvel inteiro: não há financiamento a simular.');
  }
  for (const n of restricoes.naoCalculados) naoCalculados.push(n);

  /* ---------------------------------------------------- 7. o indexador */

  const idx = acharIndexador(regras, produto.indexadorId);
  const correcao = resolverCorrecao({
    indexador: idx,
    cenarioMensalPct: entrada.cenarioIndexadorPct ?? null,
  });
  passo(
    'Indexador',
    idx?.nome ?? 'Prefixado',
    correcao.explicacao,
  );
  if (correcao.origem === 'sem_correcao' && idx && idx.tipo !== 'nenhum') {
    naoCalculados.push({
      o_que: `Correção monetária pelo ${idx.nome}`,
      motivo: correcao.explicacao,
    });
    avisos.push(correcao.explicacao);
  }
  if (correcao.origem === 'cenario') {
    avisos.push(
      'Este resultado é uma PROJEÇÃO: o índice usado é um cenário que você escolheu, não o índice observado.',
    );
  }

  /* ------------------------------------------------------ 8. a carência */

  const carenciaMeses = resolverCarencia(produto, entrada, avisos);

  /* ------------------------------------------------------ 9. o cronograma */

  const crono: Cronograma = gerarCronograma({
    financiado: valorFinanciado,
    prazoMeses: entrada.prazoMeses,
    sistema: entrada.sistema,
    taxaMensal,
    correcaoMensal: correcao.taxaMensal,
    carenciaMeses,
    carenciaCapitalizaJuros: true,
    valorAvaliacao: avaliacao,
    proponentes: quadro.proponentes,
    seguros: regras.seguros,
    politica: regras.politicaArredondamento,
  });

  registrarAcessoriosPendentes(regras, naoCalculados);
  if (crono.primeira?.parcial) {
    avisos.push(
      'A prestação mostrada é o encargo principal (amortização + juros). Os seguros e a tarifa não estão cadastrados e não foram somados — a prestação real será maior.',
    );
  }

  passo(
    '1ª prestação',
    crono.primeira ? formatarBRL(crono.primeira.prestacaoTotal) : '—',
    crono.primeira
      ? `amortização ${formatarBRL(crono.primeira.amortizacao)} + juros ${formatarBRL(crono.primeira.juros)}${crono.primeira.mip !== null ? ` + MIP ${formatarBRL(crono.primeira.mip)}` : ''}${crono.primeira.dfi !== null ? ` + DFI ${formatarBRL(crono.primeira.dfi)}` : ''}${crono.primeira.tarifa !== null ? ` + tarifa ${formatarBRL(crono.primeira.tarifa)}` : ''}`
      : '',
  );
  passo('Última prestação', crono.ultima ? formatarBRL(crono.ultima.prestacaoTotal) : '—');
  passo('Total de juros', formatarBRL(crono.totalJuros));
  passo(
    'Total pago',
    formatarBRL(crono.totalPago),
    crono.totalPagoParcial ? 'parcial: faltam seguros e/ou tarifa' : 'inclui seguros e tarifa',
  );

  /* --------------------------------------------- 10. renda e capacidade */

  const comprometimentoMaxPct = resolverComprometimento(produto, entrada);
  /*
   * A PRESTAÇÃO COMPARADA COM O LIMITE DE RENDA DEPENDE DO CADASTRO.
   *
   * "Comprometimento de até 30%" não diz de qual prestação se fala, e a mesma
   * operação passa ou não passa conforme a conta inclua os seguros. O produto
   * declara a base (`baseComprometimento`) e é ela que manda aqui — nunca uma
   * convenção implícita deste arquivo.
   */
  const baseParaRenda = prestacaoDaBase(produto.baseComprometimento, crono);
  const comprometimentoMaximo =
    comprometimentoMaxPct !== null
      ? percentualDe(quadro.rendaFamiliarBruta, comprometimentoMaxPct)
      : null;
  const comprometimentoRendaPct =
    quadro.rendaFamiliarBruta > 0 ? (baseParaRenda / quadro.rendaFamiliarBruta) * 100 : null;
  const rendaMinimaEstimada =
    comprometimentoMaxPct !== null && comprometimentoMaxPct > 0
      ? (Math.ceil((baseParaRenda * 100) / comprometimentoMaxPct) as Centavos)
      : null;

  if (rendaMinimaEstimada === null) {
    naoCalculados.push({
      o_que: 'Renda mínima estimada',
      motivo: 'Depende do comprometimento máximo de renda, que não está cadastrado nesta linha.',
    });
  } else {
    passo(
      'Renda mínima estimada',
      formatarBRL(rendaMinimaEstimada),
      `${BASE_COMPROMETIMENTO_ROTULO[produto.baseComprometimento].toLowerCase()} ÷ ${formatarPct(comprometimentoMaxPct!, 0)}`,
    );
  }

  /* ------------------------------------------------ 11. o enquadramento */

  const elegibilidade = verificarElegibilidade({
    produto,
    regras,
    valorImovel: entrada.valorImovel,
    valorAvaliacao: avaliacao,
    valorBase,
    valorFinanciado,
    necessarioAposEntrada,
    entradaPropria: naoNegativo(entrada.entradaPropria),
    entradaTotal,
    rendaFamiliarBruta: quadro.rendaFamiliarBruta,
    primeiraPrestacao: baseParaRenda,
    prazoMeses: entrada.prazoMeses,
    idadeMaisAlta: quadro.idadeMaisAlta,
    fgtsUsado,
    fgtsDisponivel,
    enquadramentoSfh: enquadramento,
    comprometimentoMaxPct,
    quotaMaxPct: restricoes.quotaMaxPct,
    prazoMaxMeses: temValor(produto.prazoMaxMeses) ? produto.prazoMaxMeses.valor : null,
    /*
     * A entrada mínima que vale é a MAIOR entre a cadastrada e a que a quota
     * impõe. Entrada mínima de 10% com quota de 80% é, na prática, entrada de
     * 20% — usar o campo isolado aprovaria um negócio que a quota reprova.
     */
    entradaMinimaPct: entradaMinimaEfetivaPct(
      temValor(produto.entradaMinimaPct) ? produto.entradaMinimaPct.valor : null,
      restricoes.quotaMaxPct,
    ),
  });

  /* ------------------------------------------------------- 12. o status */

  /*
   * A LISTA DO QUE ENTROU E DO QUE FALTOU.
   *
   * É montada da primeira parcela porque é ela que o corretor mostra. Um
   * componente ausente vira uma frase em português — e a mesma frase vai para o
   * PDF, para o cliente ver que a prestação apresentada é um piso, não o
   * número final.
   */
  const usaIndexador = (idx?.tipo ?? 'nenhum') !== 'nenhum';
  const componentes = montarComponentes(crono.primeira, idx?.nome ?? null, usaIndexador, correcao);
  if (usaIndexador && correcao.origem === 'sem_correcao') {
    naoCalculados.push({
      o_que: `Correção monetária pela ${idx?.nome ?? 'índice da linha'}`,
      motivo:
        'O índice não está cadastrado nesta versão de regras. A tabela sai SEM correção, e a prestação real será maior. Para ver o efeito, escolha um cenário na simulação.',
    });
  }

  const status = classificarStatus(produto, correcao, crono, naoCalculados, usaIndexador);

  return {
    ok: true,
    resultado: {
      versaoRegras: regras.versao,
      vigenciaRegras: regras.vigenciaInicio,
      status,
      confiabilidade: confiabilidadeDaVersao(regras),
      componentes,
      produto: {
        id: produto.id,
        nome: produto.nome,
        parametrosManuais: produto.parametrosManuais,
        bancoId: entrada.bancoId ?? produto.bancoId,
      },
      enquadramentoSfh: enquadramento,

      indexador: { id: idx?.id ?? 'NONE', nome: idx?.nome ?? 'Prefixado' },
      correcao,

      valorImovel: entrada.valorImovel,
      valorAvaliacao: avaliacao,
      valorBase,
      entradaPropria: naoNegativo(entrada.entradaPropria),
      fgtsUsado,
      subsidio: naoNegativo(entrada.subsidio),
      entradaTotal,
      valorFinanciado,
      quotaAplicadaPct,
      restricaoQueMandou: restricoes.mandou,

      sistema: entrada.sistema,
      prazoMeses: entrada.prazoMeses,
      carenciaMeses,
      taxaAnualPct: taxa,
      regimeTaxa,
      taxaAnualEfetivaPct: efetivaAnualDe(taxa, regimeTaxa),
      taxaMensal,

      primeira: crono.primeira,
      ultima: crono.ultima,
      totalJuros: crono.totalJuros,
      totalAmortizado: crono.totalAmortizado,
      totalCorrecao: crono.totalCorrecao,
      totalEncargoPrincipal: crono.totalEncargoPrincipal,
      totalSeguros: crono.totalSeguros,
      totalTarifas: crono.totalTarifas,
      totalPago: crono.totalPago,
      totalPagoParcial: crono.totalPagoParcial,

      rendaFamiliarBruta: quadro.rendaFamiliarBruta,
      comprometimentoMaximo,
      rendaMinimaEstimada,
      comprometimentoRendaPct,

      cet: null,

      tabela: crono.parcelas,
      elegibilidade,
      naoCalculados,
      avisos,
      trace,
      snapshot: regras,
    },
  };
}

/* ------------------------------------------------------------- auxiliares */

/**
 * §12 — o valor financiado é o MENOR de várias restrições, não só da quota.
 *
 * E o motor guarda **qual delas mandou**, porque é essa a informação que o
 * corretor usa: travou na quota, ele negocia mais entrada; travou na renda, ele
 * compõe renda; travou no teto do produto, ele muda de linha.
 */
function calcularRestricoes(ctx: {
  produto: ProdutoFinanciamento;
  entrada: EntradaSimulacao;
  valorBase: Centavos;
  entradaTotal: Centavos;
  quadro: QuadroDeProponentes;
  taxaMensal: number;
  regras: VersaoRegras;
}): {
  valor: Centavos;
  mandou: string;
  detalhe: string;
  quotaMaxPct: number | null;
  naoCalculados: NaoCalculado[];
} {
  const { produto, entrada, valorBase, entradaTotal } = ctx;
  const naoCalculados: NaoCalculado[] = [];

  const candidatos: { nome: string; valor: Centavos }[] = [];

  // a) o que sobra depois da entrada
  const porEntrada = naoNegativo(subtrair(valorBase, entradaTotal));
  candidatos.push({ nome: `necessário após a entrada ${formatarBRL(porEntrada)}`, valor: porEntrada });

  // b) a quota do produto
  const quotaMaxPct = produto.parametrosManuais
    ? (typeof entrada.quotaMaxPctInformada === 'number' && entrada.quotaMaxPctInformada > 0
        ? entrada.quotaMaxPctInformada
        : null)
    : temValor(produto.quotaMaxPct)
      ? produto.quotaMaxPct.valor
      : null;

  if (quotaMaxPct !== null) {
    const porQuota = percentualDe(valorBase, quotaMaxPct);
    candidatos.push({ nome: `quota ${formatarPct(quotaMaxPct, 0)} = ${formatarBRL(porQuota)}`, valor: porQuota });
  } else {
    naoCalculados.push({
      o_que: 'Percentual máximo financiável (quota)',
      motivo: produto.quotaMaxPct.observacao ?? 'A quota desta linha não está cadastrada.',
    });
  }

  // c) o teto de valor do imóvel do produto — vira teto de financiamento
  if (!produto.parametrosManuais && temValor(produto.valorImovelMax) && produto.valorImovelMax.valor > 0) {
    const teto = reaisParaCentavos(produto.valorImovelMax.valor);
    const porTeto = naoNegativo(subtrair(menor(valorBase, teto), entradaTotal));
    candidatos.push({
      nome: `teto do produto ${formatarBRL(teto)} = ${formatarBRL(porTeto)}`,
      valor: porTeto,
    });
  }

  const vencedor = candidatos.reduce((a, b) => (b.valor < a.valor ? b : a));
  return {
    valor: maior(vencedor.valor, ZERO),
    mandou: vencedor.nome,
    detalhe: candidatos.map((c) => c.nome).join(' | '),
    quotaMaxPct,
    naoCalculados,
  };
}

function resolverTaxa(produto: ProdutoFinanciamento, entrada: EntradaSimulacao): number | null {
  if (produto.parametrosManuais) {
    const informada = entrada.taxaAnualPctInformada;
    if (informada === null || informada === undefined || !Number.isFinite(informada)) return null;
    return Math.max(0, informada);
  }
  return temValor(produto.taxaAnualPct) ? produto.taxaAnualPct.valor : null;
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
 * §37 — carência só onde o produto a permite.
 *
 * Não sabendo se o produto permite (parâmetro pendente), o motor **aceita** a
 * carência pedida e avisa que ela depende de confirmação. Recusar seria
 * transformar uma lacuna do nosso cadastro numa negativa ao corretor.
 */
function resolverCarencia(
  produto: ProdutoFinanciamento,
  entrada: EntradaSimulacao,
  avisos: string[],
): number {
  const pedida = Math.max(0, Math.floor(entrada.carenciaMeses || 0));
  if (pedida === 0) return 0;

  const permite = temValor(produto.permiteCarencia) ? produto.permiteCarencia.valor : null;
  if (permite === false) {
    avisos.push('Esta linha não permite carência: a simulação foi feita sem ela.');
    return 0;
  }
  if (permite === null) {
    avisos.push(
      'A carência foi aplicada, mas a possibilidade de carência nesta linha ainda não foi confirmada nas regras. Confirme com o correspondente.',
    );
  }
  const teto = temValor(produto.carenciaMaxMeses) ? produto.carenciaMaxMeses.valor : null;
  if (teto !== null && pedida > teto) {
    avisos.push(`A carência foi limitada ao máximo desta linha (${teto} meses).`);
    return teto;
  }
  avisos.push(
    'Durante a carência não há amortização: os juros e a correção são incorporados ao saldo devedor, que por isso SOBE nesse período.',
  );
  return pedida;
}

function registrarAcessoriosPendentes(regras: VersaoRegras, naoCalculados: NaoCalculado[]): void {
  const s = regras.seguros;
  const add = (o_que: string, obs: string | null) => {
    if (naoCalculados.some((n) => n.o_que === o_que)) return;
    naoCalculados.push({ o_que, motivo: obs ?? 'Parâmetro não cadastrado.' });
  };
  if (!temValor(s.mipPorIdade)) add('MIP (morte e invalidez)', s.mipPorIdade.observacao);
  if (!temValor(s.dfiPctMensalSobreAvaliacao)) {
    add('DFI (danos ao imóvel)', s.dfiPctMensalSobreAvaliacao.observacao);
  }
  if (!temValor(s.tarifaAdminMensal)) {
    add('Tarifa de administração', s.tarifaAdminMensal.observacao);
  }
}

/**
 * §95 e §120 — a etiqueta do resultado.
 *
 * A ordem de precedência é do mais frágil para o mais forte: uma PROJEÇÃO
 * continua sendo projeção mesmo que todos os outros parâmetros sejam oficiais,
 * porque o índice hipotético contamina todos os números derivados dele.
 */
/** As duas listas do §12: o que entrou nesta prestação e o que não entrou. */
function montarComponentes(
  primeira: ParcelaCronograma | null,
  nomeIndexador: string | null,
  usaIndexador: boolean,
  correcao: CorrecaoAplicada,
): ComponentesDoCalculo {
  const incluidos: string[] = ['Juros', 'Amortização'];
  const naoIncluidos: string[] = [];

  const mipIncluido = primeira?.mip !== null && primeira?.mip !== undefined;
  const dfiIncluido = primeira?.dfi !== null && primeira?.dfi !== undefined;
  const tarifaIncluida = primeira?.tarifa !== null && primeira?.tarifa !== undefined;

  if (mipIncluido) incluidos.push('MIP (morte e invalidez)');
  else naoIncluidos.push('MIP — a tábua de taxas por faixa etária não está cadastrada');

  if (dfiIncluido) incluidos.push('DFI (danos ao imóvel)');
  else naoIncluidos.push('DFI — a taxa da apólice não está cadastrada');

  if (tarifaIncluida) incluidos.push('Tarifa de administração');
  else naoIncluidos.push('Tarifa de administração — não está cadastrada');

  const correcaoAplicada = usaIndexador && correcao.origem !== 'sem_correcao';
  if (usaIndexador) {
    if (correcaoAplicada) incluidos.push(`Correção por ${nomeIndexador ?? 'índice'}`);
    else naoIncluidos.push(`Correção por ${nomeIndexador ?? 'índice'} — o índice não está cadastrado`);
  }

  return { incluidos, naoIncluidos, mipIncluido, dfiIncluido, tarifaIncluida, correcaoAplicada };
}

function classificarStatus(
  produto: ProdutoFinanciamento,
  correcao: CorrecaoAplicada,
  crono: Cronograma,
  naoCalculados: NaoCalculado[],
  usaIndexador: boolean,
): StatusCalculo {
  // Projeção contamina tudo que vem depois dela: o índice hipotético entra no
  // saldo, e o saldo entra em todos os outros números.
  if (correcao.origem === 'cenario') return 'PROJECAO';
  /*
   * Linha indexada calculada sem o índice é um caso à parte, e mais grave que
   * "falta um parâmetro": TODA a tabela sai abaixo do real, mês a mês, e o erro
   * cresce com o prazo. Merece rótulo próprio em vez de se diluir no genérico.
   */
  if (usaIndexador && correcao.origem === 'sem_correcao') return 'SEM_CORRECAO';
  // Faltando parâmetro, o resultado pede validação MESMO com condição
  // informada pelo corretor — a taxa pode ser a real e a prestação continuar
  // incompleta por falta do seguro.
  if (naoCalculados.length > 0 || crono.totalPagoParcial) return 'REQUER_VALIDACAO';
  if (produto.parametrosManuais) return 'INFORMADO';
  if (produto.taxaAnualPct.origem === 'oficial') return 'OFICIAL';
  return 'ESTIMADO';
}

/**
 * O texto obrigatório do rodapé — §96 e §123.
 *
 * Vive no motor, e não nas telas, porque TODA saída precisa carregá-lo:
 * dashboard, PDF, link compartilhado, resposta da LIA. Deixar isso a cargo de
 * cada tela é garantir que uma esqueça — e é justamente a que vai parar na mão
 * do cliente.
 */
export const AVISO_LEGAL =
  'Simulação estimada, gerada pelo POUP a partir dos dados informados. Não é proposta de crédito nem garantia de aprovação. As condições finais — taxa, prazo, seguros, tarifas e enquadramento — dependem de análise de crédito e de avaliação do imóvel pela instituição financeira.';

export function resumoDaSimulacao(r: ResultadoSimulacao): string {
  return `${formatarBRL(r.valorFinanciado)} em ${formatarPrazo(r.prazoMeses)} · ${r.sistema} · 1ª de ${formatarBRL(r.primeira?.prestacaoTotal ?? ZERO)}`;
}
