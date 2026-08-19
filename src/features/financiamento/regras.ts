/**
 * AS REGRAS DO FINANCIAMENTO — dados, nunca código.
 *
 * ===========================================================================
 * A EXIGÊNCIA QUE MOLDOU ESTE ARQUIVO
 * ===========================================================================
 * Nenhuma regra financeira pode estar escrita dentro da lógica. Nada de
 * `if (renda <= 5000) taxa = 4.75` espalhado por aí. Quando a CAIXA mudar uma
 * taxa por portaria — e ela muda —, o administrador precisa alterar um
 * parâmetro, não um arquivo de código, e sem republicar aplicativo nenhum.
 *
 * Por isso tudo aqui é **estrutura de dados**. O motor lê; não decide.
 *
 * ===========================================================================
 * ORIGEM: A DIFERENÇA ENTRE SABER E ACHAR
 * ===========================================================================
 * Todo número carrega de onde veio. Três origens, e elas mudam o que a tela
 * mostra:
 *
 *   **oficial**    — confirmado em documentação da instituição, com fonte e
 *                    data. É o único que pode ser apresentado como condição.
 *   **estimativa** — calculado por nós, ou uma convenção de mercado. Aparece
 *                    marcado como estimativa na tela e no PDF.
 *   **pendente**   — não confirmado. `valor` é `null`, e o motor **se recusa a
 *                    chutar**: o resultado sai com "não calculado" naquele
 *                    ponto, dizendo qual parâmetro falta.
 *
 * Um número inventado com cara de oficial é o pior defeito que este módulo
 * poderia ter: o corretor mostra ao cliente, o cliente vai ao banco, e a
 * condição é outra. O `pendente` existe para tornar isso impossível.
 *
 * ===========================================================================
 * POR QUE A SEMENTE VEM QUASE TODA PENDENTE
 * ===========================================================================
 * Ver `regrasPadrao.ts`. Em resumo: os parâmetros oficiais do MCMV e do SBPE
 * mudam por normativo e precisam ser lidos na fonte, pelo administrador, no dia
 * em que ele for cadastrá-los. O produto **"Condições informadas"** existe
 * justamente para o simulador funcionar por inteiro sem depender disso — é o
 * corretor digitando a taxa, o prazo e a quota que o correspondente bancário
 * passou para aquele cliente, que é como a negociação realmente acontece.
 *
 * ===========================================================================
 * VERSIONAMENTO E O CONGELAMENTO DA SIMULAÇÃO
 * ===========================================================================
 * As regras vivem em VERSÕES com vigência. Uma simulação salva guarda o
 * `snapshot` inteiro da versão que a produziu. Mudar a taxa amanhã não pode
 * recalcular silenciosamente a proposta que o cliente assinou ontem — e não
 * recalcula, porque a proposta de ontem não lê a regra de hoje.
 */
import type { SistemaAmortizacao } from './amortizacao';
import type { PoliticaArredondamento, RegimeTaxa } from './dinheiro';
import type { Indexador } from './indexador';
import type { RegrasSeguros } from './seguros';

/* ------------------------------------------------------------------ origem */

export type OrigemParametro = 'oficial' | 'estimativa' | 'pendente';

/**
 * Um número (ou booleano) com procedência.
 *
 * `valor === null` significa PENDING_VALIDATION — e é a única forma de
 * ausência aceita. Não existe "zero como se fosse desconhecido" neste módulo:
 * zero é um valor legítimo (taxa zero existe) e confundir os dois seria o
 * caminho mais curto para uma condição inventada.
 */
export interface Parametro<T> {
  valor: T | null;
  origem: OrigemParametro;
  /** Quem afirma. Ex.: 'CAIXA — Minha Casa Minha Vida urbana'. */
  fonte: string | null;
  fonteUrl: string | null;
  /** Vigência da AFIRMAÇÃO, que não é a vigência da versão de regras. */
  verificadoEm: string | null;
  /** Por que está pendente, ou o que a estimativa assume. */
  observacao: string | null;
}

export function oficial<T>(
  valor: T,
  fonte: string,
  fonteUrl: string,
  verificadoEm: string,
  observacao: string | null = null,
): Parametro<T> {
  return { valor, origem: 'oficial', fonte, fonteUrl, verificadoEm, observacao };
}

export function estimativa<T>(valor: T, observacao: string): Parametro<T> {
  return {
    valor,
    origem: 'estimativa',
    fonte: 'POUP — estimativa',
    fonteUrl: null,
    verificadoEm: null,
    observacao,
  };
}

export function pendente<T>(motivo: string): Parametro<T> {
  return {
    valor: null,
    origem: 'pendente',
    fonte: null,
    fonteUrl: null,
    verificadoEm: null,
    observacao: motivo,
  };
}

/** O parâmetro tem número utilizável? */
export function temValor<T>(p: Parametro<T> | undefined | null): p is Parametro<T> & { valor: T } {
  return !!p && p.valor !== null && p.valor !== undefined;
}

/* ----------------------------------------------------------------- domínio */

export type TipoOperacao =
  | 'aquisicao_novo'
  | 'aquisicao_usado'
  | 'construcao'
  | 'terreno_e_construcao';

export const OPERACAO_ROTULO: Record<TipoOperacao, string> = {
  aquisicao_novo: 'Aquisição de imóvel novo',
  aquisicao_usado: 'Aquisição de imóvel usado',
  construcao: 'Construção',
  terreno_e_construcao: 'Terreno + construção',
};

export type TipoImovel = 'residencial' | 'comercial';

export const IMOVEL_ROTULO: Record<TipoImovel, string> = {
  residencial: 'Residencial',
  comercial: 'Comercial',
};

/**
 * Uma linha de financiamento.
 *
 * Cada campo numérico é um `Parametro`, então o produto sabe dizer não só
 * quanto vale como de onde veio e se pode ser mostrado como condição oficial.
 */
export interface ProdutoFinanciamento {
  id: string;
  nome: string;
  descricao: string;

  /**
   * Quando `true`, os números vêm do que o CORRETOR digitou na simulação, e
   * não deste cadastro. É o produto que funciona sem depender de parâmetro
   * oficial nenhum — o corretor recebe a condição aprovada do correspondente
   * bancário e a informa.
   */
  parametrosManuais: boolean;

  operacoes: TipoOperacao[];
  tiposImovel: TipoImovel[];

  /**
   * Renda bruta familiar mensal, em reais. `max: null` = sem teto.
   *
   * É um `Parametro` como qualquer outro porque a faixa de renda do MCMV **é**
   * um número oficial que muda por normativo — foi reajustada em 2025 e de
   * novo em 2026. Deixá-la como número solto aqui seria exatamente o tipo de
   * regra hardcoded que este arquivo existe para evitar.
   */
  faixaRenda: Parametro<{ min: number; max: number | null }>;

  /** UFs onde vale. `null` = todas. */
  ufs: string[] | null;

  valorImovelMax: Parametro<number>;
  /** % do valor do imóvel que pode ser financiado. */
  quotaMaxPct: Parametro<number>;
  prazoMaxMeses: Parametro<number>;
  taxaAnualPct: Parametro<number>;
  /**
   * A taxa acima é NOMINAL ou EFETIVA ao ano? — §16 a §18.
   *
   * Não é detalhe: 10% nominais viram 0,8333% ao mês e 10,47% efetivos; 10%
   * efetivos viram 0,7974% ao mês. Em 420 meses a diferença passa de vinte mil
   * reais num financiamento de R$ 240 mil. A CAIXA publica algumas linhas em
   * taxa nominal (o MCMV Classe Média, por exemplo), então o regime pertence ao
   * produto e nunca a uma convenção implícita do código.
   */
  regimeTaxa: RegimeTaxa;
  /** Entrada mínima exigida, em % do valor do imóvel. */
  entradaMinimaPct: Parametro<number>;
  /** O produto admite carência para início da amortização? — §37 */
  permiteCarencia: Parametro<boolean>;
  carenciaMaxMeses: Parametro<number>;
  /** % da renda bruta familiar que a prestação pode consumir. */
  comprometimentoRendaMaxPct: Parametro<number>;
  /** Idade do proponente + prazo do contrato não pode passar disto. */
  idadeMaisPrazoMaxAnos: Parametro<number>;
  /** Teto do subsídio/desconto. `0` é resposta legítima (faixa sem subsídio). */
  subsidioMax: Parametro<number>;

  sistemas: SistemaAmortizacao[];
  indexadorId: string;

  fonte: string | null;
  fonteUrl: string | null;
}

/**
 * FGTS — §10.
 *
 * "O motor deve tratar FGTS como fonte de recursos, e não como desconto
 * arbitrário", e "nunca permitir `fgtsUsed > fgtsAvailable`". As regras de
 * direito de uso (três anos de carteira, não possuir imóvel na região, saldo
 * real na conta vinculada) dependem de dados que este aplicativo não tem e não
 * deveria ter — quem verifica é a Caixa. O motor SOMA o que o corretor informar
 * e diz, em voz alta, que o direito não foi verificado.
 */
export interface RegrasFgts {
  /** O saldo do FGTS pode compor a entrada nesta operação? */
  permitidoNaEntrada: Parametro<boolean>;
  /** Regras de uso, para a tela mostrar ao corretor. */
  condicoes: string[];
}

/**
 * Enquadramento SFH / SFI — §13.
 *
 * A classificação depende do VALOR DE AVALIAÇÃO do imóvel: até o limite é SFH,
 * acima é SFI. O limite muda por normativo e por isso é parâmetro — o manual
 * anota que a página oficial consultada informa R$ 2,25 milhões, e é
 * exatamente esse tipo de número que não pode virar constante eterna.
 */
export interface RegrasEnquadramentoSfh {
  limiteValorImovel: Parametro<number>;
}

export type Enquadramento = 'SFH' | 'SFI' | 'indefinido';

export type StatusVersao = 'rascunho' | 'ativa' | 'encerrada';

/**
 * Um conjunto completo e datado de regras.
 *
 * O nome da versão segue AAAA.MM porque é assim que o corretor pensa ("a regra
 * de agosto"), e porque ordena sozinho.
 */
export interface VersaoRegras {
  versao: string;
  vigenciaInicio: string;
  vigenciaFim: string | null;
  status: StatusVersao;

  /**
   * Como o cronograma trata a fração de centavo — §65 e §66.
   *
   * `mensal` fecha cada mês em centavos inteiros (o que o boleto faz);
   * `final` carrega a precisão e arredonda na exibição. É decisão de contrato,
   * e o §66 pede justamente que ela fique documentada em vez de implícita.
   */
  politicaArredondamento: PoliticaArredondamento;

  indexadores: Indexador[];
  produtos: ProdutoFinanciamento[];
  seguros: RegrasSeguros;
  fgts: RegrasFgts;
  sfh: RegrasEnquadramentoSfh;

  fonte: string | null;
  fonteUrl: string | null;
  notas: string | null;
}

/**
 * SFH ou SFI, pelo valor de AVALIAÇÃO — §13.
 *
 * `indefinido` quando o limite não está cadastrado. Não se chuta: a
 * classificação muda quota, tarifa e a possibilidade de usar FGTS, e errá-la
 * silenciosamente contamina o resultado inteiro.
 */
export function classificarSfh(
  regras: VersaoRegras,
  valorAvaliacaoReais: number,
): { enquadramento: Enquadramento; limite: number | null } {
  const limite = temValor(regras.sfh.limiteValorImovel) ? regras.sfh.limiteValorImovel.valor : null;
  if (limite === null) return { enquadramento: 'indefinido', limite: null };
  return { enquadramento: valorAvaliacaoReais <= limite ? 'SFH' : 'SFI', limite };
}

/* ------------------------------------------------------------------ acesso */

export function acharProduto(regras: VersaoRegras, produtoId: string): ProdutoFinanciamento | null {
  return regras.produtos.find((p) => p.id === produtoId) ?? null;
}

export function acharIndexador(regras: VersaoRegras, indexadorId: string): Indexador | null {
  return regras.indexadores.find((i) => i.id === indexadorId) ?? null;
}

/**
 * Os produtos que servem para este cliente, nesta operação, nesta UF.
 *
 * Filtra por renda, operação, tipo de imóvel e UF. NÃO filtra por valor do
 * imóvel nem por prazo: isso é elegibilidade, e a diferença importa — um
 * produto que o cliente quase alcança precisa aparecer com o motivo da recusa,
 * e não sumir da lista como se não existisse.
 */
export function produtosCandidatos(
  regras: VersaoRegras,
  criterio: {
    rendaFamiliarMensal: number;
    operacao: TipoOperacao;
    tipoImovel: TipoImovel;
    uf: string | null;
  },
): ProdutoFinanciamento[] {
  return regras.produtos.filter((p) => {
    if (!p.operacoes.includes(criterio.operacao)) return false;
    if (!p.tiposImovel.includes(criterio.tipoImovel)) return false;
    if (p.ufs && criterio.uf && !p.ufs.includes(criterio.uf)) return false;
    // Faixa não confirmada não filtra ninguém: filtrar por um limite que não
    // conhecemos seria decidir com base em chute. O produto entra na lista e a
    // tela mostra que ele está sem parâmetro.
    if (!temValor(p.faixaRenda)) return true;
    const { min, max } = p.faixaRenda.valor;
    if (criterio.rendaFamiliarMensal < min) return false;
    if (max !== null && criterio.rendaFamiliarMensal > max) return false;
    return true;
  });
}

/**
 * Todo parâmetro pendente de uma versão, para a tela do administrador cobrar.
 *
 * É a lista de tarefas do admin: enquanto ela não estiver vazia, há produto que
 * o simulador não consegue calcular por inteiro.
 */
export function parametrosPendentes(regras: VersaoRegras): { onde: string; motivo: string }[] {
  const saida: { onde: string; motivo: string }[] = [];
  const push = (onde: string, p: Parametro<unknown>) => {
    if (p.origem === 'pendente') saida.push({ onde, motivo: p.observacao ?? 'Não confirmado.' });
  };

  for (const i of regras.indexadores) {
    if (i.tipo === 'nenhum') continue;
    push(`Indexador ${i.nome} · taxa mensal observada`, i.taxaMensal);
  }
  for (const p of regras.produtos) {
    if (p.parametrosManuais) continue;
    push(`${p.nome} · faixa de renda`, p.faixaRenda);
    push(`${p.nome} · valor máximo do imóvel`, p.valorImovelMax);
    push(`${p.nome} · quota máxima`, p.quotaMaxPct);
    push(`${p.nome} · prazo máximo`, p.prazoMaxMeses);
    push(`${p.nome} · taxa ao ano`, p.taxaAnualPct);
    push(`${p.nome} · comprometimento de renda`, p.comprometimentoRendaMaxPct);
    push(`${p.nome} · idade + prazo`, p.idadeMaisPrazoMaxAnos);
    push(`${p.nome} · subsídio máximo`, p.subsidioMax);
    push(`${p.nome} · entrada mínima`, p.entradaMinimaPct);
  }
  push('Seguros · tábua do MIP por faixa etária', regras.seguros.mipPorIdade);
  push('Seguros · taxa do DFI', regras.seguros.dfiPctMensalSobreAvaliacao);
  push('Encargos · tarifa de administração', regras.seguros.tarifaAdminMensal);
  push('FGTS · permitido na entrada', regras.fgts.permitidoNaEntrada);
  push('Enquadramento · limite SFH', regras.sfh.limiteValorImovel);

  return saida;
}

/** O produto consegue ser simulado sem parâmetro faltando? */
export function produtoCalculavel(p: ProdutoFinanciamento): boolean {
  if (p.parametrosManuais) return true;
  return (
    temValor(p.faixaRenda) &&
    temValor(p.taxaAnualPct) &&
    temValor(p.prazoMaxMeses) &&
    temValor(p.quotaMaxPct) &&
    temValor(p.comprometimentoRendaMaxPct)
  );
}
