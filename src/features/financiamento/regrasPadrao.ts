/**
 * A VERSÃO DE REGRAS QUE VEM DE FÁBRICA — 2026.08.
 *
 * ===========================================================================
 * DE ONDE VIERAM OS NÚMEROS QUE ESTÃO AQUI
 * ===========================================================================
 * Eles vieram do **manual técnico do motor de simulação**, entregue pelo dono do
 * aplicativo, que registra o que as páginas oficiais da CAIXA informavam na data
 * da consulta. Cada parâmetro carrega essa procedência: a fonte é a página
 * oficial, e a `observacao` diz que o valor chegou pelo manual e **deve ser
 * reconferido na fonte** antes de ser apresentado como condição definitiva.
 *
 * Isso é diferente de inventar, e é diferente de confirmar pessoalmente. É o
 * meio-termo honesto: o número é utilizável, sua origem está registrada, e quem
 * for auditar sabe exatamente o que foi verificado por quem.
 *
 * ===========================================================================
 * O QUE CONTINUA PENDENTE, E POR QUÊ
 * ===========================================================================
 * O manual é explícito sobre o que **não** se pode preencher (§74, §75):
 *
 *   - **tábua do MIP** (§34): "as taxas são definidas na apólice e o valor varia
 *     em função da faixa etária". É dado da seguradora, não da CAIXA.
 *   - **taxa do DFI** (§35): idem, depende da apólice.
 *   - **tarifa de administração** (§36): "não utilizar um valor universal".
 *   - **TR e IPCA** (§108, §109): são do Banco Central e do IBGE, e projetá-los
 *     é previsão econômica. O corretor pode rodar um CENÁRIO, que sai marcado
 *     como projeção.
 *   - **taxas e faixas do MCMV 1, 2 e 3**: o manual traz o teto do programa
 *     (R$ 13 mil) e as condições da Classe Média, mas não as taxas por faixa.
 *   - **quota do SBPE**: o manual diz que "pode chegar a 90%, dependendo da
 *     modalidade, recursos e sistema" — isso é um TETO, não uma quota. Cadastrar
 *     90% como se fosse a quota daria ao corretor um número que o banco não
 *     confirma.
 *
 * ===========================================================================
 * E O PRODUTO QUE SEMPRE FUNCIONA
 * ===========================================================================
 * "Condições informadas" continua sendo o caminho do dia a dia: o corretor
 * digita a taxa, o prazo e a quota que o correspondente bancário aprovou **para
 * aquele cliente**, que quase nunca é a tabela genérica do site. A matemática é
 * a mesma; só os parâmetros mudam de dono.
 */
import type { Indexador } from './indexador';
import type { ProdutoFinanciamento, VersaoRegras } from './regras';
import { estimativa, oficial, pendente } from './regras';

const CAIXA_MCMV =
  'https://www.caixa.gov.br/voce/habitacao/minha-casa-minha-vida/urbana/Paginas/default.aspx';
const CAIXA_CLASSE_MEDIA =
  'https://www.caixa.gov.br/voce/habitacao/minha-casa-minha-vida/classe-media/Paginas/default.aspx';
const CAIXA_NOVO =
  'https://www.caixa.gov.br/voce/habitacao/financiamento/aquisicao-imovel-novo/Paginas/default.aspx';
const CAIXA_FAQ =
  'https://www.caixa.gov.br/voce/habitacao/financiamento/perguntas-frequentes/Paginas/default.aspx';

/** A data em que o manual registrou a consulta às páginas oficiais. */
const VERIFICADO_EM = '2026-08-19';

/** A ressalva que acompanha todo número vindo do manual. */
const VIA_MANUAL =
  'Valor registrado no manual técnico do motor (consulta às páginas oficiais em 19/08/2026). Reconfira na fonte antes de apresentar como condição definitiva — estes parâmetros mudam por normativo.';

const A_CONFIRMAR = (o_que: string, onde: string) =>
  `${o_que} muda por normativo e não consta do material verificado. Confirme em ${onde} e cadastre em Ajustes → Financiamento → Regras.`;

/* -------------------------------------------------------------- indexadores */

const INDEXADORES: Indexador[] = [
  {
    id: 'NONE',
    nome: 'Prefixado',
    descricao:
      'Sem atualização por TR ou IPCA. O saldo devedor só diminui, por amortização. A parcela varia apenas pelo sistema escolhido.',
    tipo: 'nenhum',
    taxaMensal: oficial(
      0,
      'CAIXA — modalidade prefixada',
      CAIXA_FAQ,
      VERIFICADO_EM,
      'No prefixado não há atualização por TR/IPCA — a correção é zero por definição, não por falta de dado.',
    ),
    fonteOficial: null,
  },
  {
    id: 'TR',
    nome: 'TR — Taxa Referencial',
    descricao:
      'O indexador tradicional do crédito imobiliário. O saldo devedor é corrigido pela TR ANTES de os juros incidirem.',
    tipo: 'mensal',
    taxaMensal: pendente<number>(
      'A TR é divulgada pelo Banco Central e varia mês a mês; projetá-la é previsão econômica, não condição de contrato. Sem valor cadastrado, a tabela sai SEM correção — e o resultado real será maior. Para ver o efeito, use um cenário hipotético na simulação.',
    ),
    fonteOficial: 'Banco Central do Brasil',
  },
  {
    id: 'IPCA',
    nome: 'IPCA',
    descricao: 'Correção pela inflação oficial, aplicada ao saldo devedor antes dos juros.',
    tipo: 'mensal',
    taxaMensal: pendente<number>(
      'O IPCA é apurado pelo IBGE. Usar previsão de IPCA como se fosse índice observado é justamente o que o manual proíbe (§109). Sem valor cadastrado, a tabela sai SEM correção.',
    ),
    fonteOficial: 'IBGE',
  },
  {
    id: 'POUPANCA',
    nome: 'Poupança + taxa fixa',
    descricao: 'Linha corrigida pelo rendimento da caderneta de poupança.',
    tipo: 'mensal',
    taxaMensal: pendente<number>(
      'O rendimento da poupança acompanha a Selic e a TR, ambas do Banco Central. Sem valor cadastrado, a tabela sai SEM correção.',
    ),
    fonteOficial: 'Banco Central do Brasil',
  },
];

/* ----------------------------------------------------------------- produtos */

/** O esqueleto de uma faixa do MCMV cujas condições ainda não foram lidas. */
function faixaMcmv(id: string, nome: string, descricao: string): ProdutoFinanciamento {
  return {
    id,
    nome,
    descricao,
    parametrosManuais: false,
    operacoes: ['aquisicao_novo', 'aquisicao_usado', 'construcao'],
    tiposImovel: ['residencial'],
    ufs: null,
    faixaRenda: pendente<{ min: number; max: number | null }>(
      A_CONFIRMAR('O teto de renda bruta familiar desta faixa', 'caixa.gov.br (MCMV urbana)'),
    ),
    valorImovelMax: pendente<number>(
      A_CONFIRMAR('O valor máximo do imóvel nesta faixa', 'caixa.gov.br (MCMV urbana)'),
    ),
    quotaMaxPct: pendente<number>(
      A_CONFIRMAR('O percentual financiável desta faixa', 'caixa.gov.br (MCMV urbana)'),
    ),
    prazoMaxMeses: oficial(
      420,
      'CAIXA — financiamento habitacional',
      CAIXA_MCMV,
      VERIFICADO_EM,
      `Prazo de até 35 anos em diversas modalidades. ${VIA_MANUAL}`,
    ),
    taxaAnualPct: pendente<number>(
      A_CONFIRMAR('A taxa de juros desta faixa', 'caixa.gov.br (MCMV urbana)'),
    ),
    regimeTaxa: 'nominal',
    entradaMinimaPct: pendente<number>(
      A_CONFIRMAR('A entrada mínima desta faixa', 'caixa.gov.br (MCMV urbana)'),
    ),
    permiteCarencia: pendente<boolean>(
      A_CONFIRMAR('A possibilidade de carência nesta modalidade', 'caixa.gov.br'),
    ),
    carenciaMaxMeses: pendente<number>(A_CONFIRMAR('O prazo máximo de carência', 'caixa.gov.br')),
    comprometimentoRendaMaxPct: oficial(
      30,
      'CAIXA — perguntas frequentes',
      CAIXA_FAQ,
      VERIFICADO_EM,
      `A prestação pode comprometer até 30% da renda familiar bruta em determinadas operações. ${VIA_MANUAL}`,
    ),
    idadeMaisPrazoMaxAnos: pendente<number>(
      A_CONFIRMAR('O limite de idade do proponente somada ao prazo', 'caixa.gov.br'),
    ),
    subsidioMax: pendente<number>(
      A_CONFIRMAR('O teto do subsídio (desconto) desta faixa', 'caixa.gov.br (MCMV urbana)'),
    ),
    sistemas: ['SAC', 'PRICE'],
    indexadorId: 'TR',
    fonte: 'CAIXA — Minha Casa, Minha Vida (urbana)',
    fonteUrl: CAIXA_MCMV,
  };
}

export const VERSAO_PADRAO = '2026.08';

export const REGRAS_PADRAO: VersaoRegras = {
  versao: VERSAO_PADRAO,
  vigenciaInicio: '2026-08-01',
  vigenciaFim: null,
  status: 'ativa',

  /*
   * §66: "quando o contrato exigir arredondamento mensal, documentar
   * explicitamente". Contrato habitacional cobra em boleto, e boleto é em
   * centavos inteiros — então `mensal` é o padrão. O administrador pode trocar
   * para `final` quando quiser o total teoricamente exato.
   */
  politicaArredondamento: 'mensal',

  indexadores: INDEXADORES,

  produtos: [
    /* ---------------------------------------------- o que sempre funciona */
    {
      id: 'informado',
      nome: 'Condições informadas',
      descricao:
        'Você informa a taxa, o prazo e a quota que o correspondente bancário aprovou para este cliente. É a condição real da negociação — o cálculo é feito em cima dela.',
      parametrosManuais: true,
      operacoes: ['aquisicao_novo', 'aquisicao_usado', 'construcao', 'terreno_e_construcao'],
      tiposImovel: ['residencial', 'comercial'],
      ufs: null,
      faixaRenda: estimativa({ min: 0, max: null }, 'Sem faixa: quem informa a condição é você.'),
      valorImovelMax: estimativa(0, 'Sem teto: o limite é a condição informada.'),
      quotaMaxPct: estimativa(100, 'Você informa a quota aprovada na simulação.'),
      prazoMaxMeses: estimativa(420, 'Teto do campo. O prazo efetivo é o que você informar.'),
      taxaAnualPct: estimativa(0, 'Você informa a taxa aprovada na simulação.'),
      regimeTaxa: 'nominal',
      entradaMinimaPct: estimativa(0, 'A entrada é o que você informar.'),
      permiteCarencia: estimativa(true, 'Informe a carência acordada, se houver.'),
      carenciaMaxMeses: estimativa(36, 'Teto do campo, não regra do banco.'),
      comprometimentoRendaMaxPct: oficial(
        30,
        'CAIXA — perguntas frequentes',
        CAIXA_FAQ,
        VERIFICADO_EM,
        `Referência para o alerta de renda: a prestação pode comprometer até 30% da renda familiar bruta em determinadas operações. ${VIA_MANUAL}`,
      ),
      idadeMaisPrazoMaxAnos: pendente<number>(
        A_CONFIRMAR('O limite de idade somada ao prazo', 'caixa.gov.br'),
      ),
      subsidioMax: estimativa(0, 'Subsídio, quando houver, é informado como valor na simulação.'),
      sistemas: ['SAC', 'PRICE'],
      indexadorId: 'NONE',
      fonte: null,
      fonteUrl: null,
    },

    /* ------------------------------------------- MCMV Classe Média (§47) */
    {
      id: 'mcmv_classe_media',
      nome: 'MCMV Classe Média',
      descricao:
        'Faixa do programa para a classe média: sem subsídio, com juros abaixo do mercado tradicional e prazo estendido.',
      parametrosManuais: false,
      operacoes: ['aquisicao_novo', 'aquisicao_usado'],
      tiposImovel: ['residencial'],
      ufs: null,
      faixaRenda: oficial(
        { min: 0, max: 13000 },
        'CAIXA — MCMV Classe Média',
        CAIXA_CLASSE_MEDIA,
        VERIFICADO_EM,
        `Renda familiar mensal de até R$ 13.000. ${VIA_MANUAL}`,
      ),
      valorImovelMax: oficial(
        600000,
        'CAIXA — MCMV Classe Média',
        CAIXA_CLASSE_MEDIA,
        VERIFICADO_EM,
        `Valor do imóvel de até R$ 600.000. ${VIA_MANUAL}`,
      ),
      /*
       * A QUOTA É DERIVADA DA ENTRADA MÍNIMA, e não um número à parte.
       *
       * O manual informa "entrada mínima de 20%" para esta modalidade. Entrada
       * mínima de 20% é o mesmo que quota máxima de 80% — são o complemento um
       * do outro, e cadastrar os dois separadamente criaria a chance de eles
       * se contradizerem no cadastro.
       */
      quotaMaxPct: oficial(
        80,
        'CAIXA — MCMV Classe Média',
        CAIXA_CLASSE_MEDIA,
        VERIFICADO_EM,
        `Complemento da entrada mínima de 20% informada para a modalidade. ${VIA_MANUAL}`,
      ),
      entradaMinimaPct: oficial(
        20,
        'CAIXA — MCMV Classe Média',
        CAIXA_CLASSE_MEDIA,
        VERIFICADO_EM,
        `Entrada mínima de 20%. ${VIA_MANUAL}`,
      ),
      prazoMaxMeses: oficial(
        420,
        'CAIXA — MCMV Classe Média',
        CAIXA_CLASSE_MEDIA,
        VERIFICADO_EM,
        `Prazo de até 35 anos. ${VIA_MANUAL}`,
      ),
      taxaAnualPct: oficial(
        10,
        'CAIXA — MCMV Classe Média',
        CAIXA_CLASSE_MEDIA,
        VERIFICADO_EM,
        `Taxa NOMINAL de 10% ao ano — que composta equivale a 10,47% efetivos. ${VIA_MANUAL}`,
      ),
      /*
       * NOMINAL, e isto é o ponto do §17 e §18.
       *
       * O manual diz "taxa nominal de 10% a.a.". Nominal vira 0,8333% ao mês
       * (10/12), e não 0,7974% (que seria a conversão de uma efetiva de 10%).
       * Em 420 meses a diferença passa de vinte mil reais — é o tipo de erro
       * que só aparece quando o cliente compara a simulação com a proposta.
       */
      regimeTaxa: 'nominal',
      permiteCarencia: pendente<boolean>(
        A_CONFIRMAR('A possibilidade de carência nesta modalidade', 'caixa.gov.br (Classe Média)'),
      ),
      carenciaMaxMeses: pendente<number>(A_CONFIRMAR('O prazo máximo de carência', 'caixa.gov.br')),
      comprometimentoRendaMaxPct: oficial(
        30,
        'CAIXA — perguntas frequentes',
        CAIXA_FAQ,
        VERIFICADO_EM,
        `A prestação pode comprometer até 30% da renda familiar bruta em determinadas operações. ${VIA_MANUAL}`,
      ),
      idadeMaisPrazoMaxAnos: pendente<number>(
        A_CONFIRMAR('O limite de idade somada ao prazo', 'caixa.gov.br'),
      ),
      subsidioMax: oficial(
        0,
        'CAIXA — MCMV Classe Média',
        CAIXA_CLASSE_MEDIA,
        VERIFICADO_EM,
        `A modalidade Classe Média não tem subsídio. ${VIA_MANUAL}`,
      ),
      sistemas: ['SAC', 'PRICE'],
      indexadorId: 'TR',
      fonte: 'CAIXA — Minha Casa, Minha Vida (Classe Média)',
      fonteUrl: CAIXA_CLASSE_MEDIA,
    },

    faixaMcmv('mcmv_1', 'MCMV Faixa 1', 'Menor renda, com subsídio e as menores taxas do programa.'),
    faixaMcmv('mcmv_2', 'MCMV Faixa 2', 'Renda baixa, ainda com subsídio.'),
    faixaMcmv('mcmv_3', 'MCMV Faixa 3', 'Renda média, com taxa reduzida.'),

    /* ------------------------------------------------------------- SBPE */
    {
      id: 'sbpe_tr',
      nome: 'SBPE — corrigido pela TR',
      descricao:
        'Financiamento tradicional, fora do MCMV. Para quem passa do teto de renda do programa ou compra imóvel acima do limite.',
      parametrosManuais: false,
      operacoes: ['aquisicao_novo', 'aquisicao_usado', 'construcao', 'terreno_e_construcao'],
      tiposImovel: ['residencial', 'comercial'],
      ufs: null,
      faixaRenda: oficial(
        { min: 0, max: null },
        'CAIXA — financiamento de imóveis',
        CAIXA_NOVO,
        VERIFICADO_EM,
        'O SBPE não tem faixa de renda: o limite é a capacidade de pagamento, verificada pelo comprometimento.',
      ),
      valorImovelMax: pendente<number>(
        A_CONFIRMAR('O valor máximo do imóvel no SBPE', 'caixa.gov.br (imóvel novo/usado)'),
      ),
      quotaMaxPct: pendente<number>(
        'A quota do SBPE depende da modalidade, dos recursos e do sistema de amortização — o material verificado informa que ela "pode chegar a 90%", o que é um TETO e não a quota da sua operação. Cadastrar 90% aqui daria ao corretor um número que o banco não confirma. Confirme a quota da modalidade em caixa.gov.br e cadastre.',
      ),
      entradaMinimaPct: pendente<number>(
        A_CONFIRMAR('A entrada mínima do SBPE', 'caixa.gov.br (imóvel novo/usado)'),
      ),
      prazoMaxMeses: oficial(
        420,
        'CAIXA — financiamento de imóveis',
        CAIXA_NOVO,
        VERIFICADO_EM,
        `Prazo de até 35 anos em diversas modalidades. ${VIA_MANUAL}`,
      ),
      taxaAnualPct: pendente<number>(
        'A taxa do SBPE varia por relacionamento com o banco e por modalidade, e é definida na proposta. Peça a taxa aprovada ao correspondente e use "Condições informadas", ou cadastre a taxa da sua praça aqui.',
      ),
      regimeTaxa: 'nominal',
      permiteCarencia: pendente<boolean>(
        A_CONFIRMAR('A possibilidade de carência nesta modalidade', 'caixa.gov.br'),
      ),
      carenciaMaxMeses: pendente<number>(A_CONFIRMAR('O prazo máximo de carência', 'caixa.gov.br')),
      comprometimentoRendaMaxPct: oficial(
        30,
        'CAIXA — perguntas frequentes',
        CAIXA_FAQ,
        VERIFICADO_EM,
        `A prestação pode comprometer até 30% da renda familiar bruta em determinadas operações. ${VIA_MANUAL}`,
      ),
      idadeMaisPrazoMaxAnos: pendente<number>(
        A_CONFIRMAR('O limite de idade somada ao prazo', 'caixa.gov.br'),
      ),
      subsidioMax: oficial(
        0,
        'CAIXA — financiamento de imóveis',
        CAIXA_NOVO,
        VERIFICADO_EM,
        'O SBPE não tem subsídio de programa habitacional.',
      ),
      sistemas: ['SAC', 'PRICE'],
      indexadorId: 'TR',
      fonte: 'CAIXA — Aquisição de imóvel novo',
      fonteUrl: CAIXA_NOVO,
    },
    {
      id: 'sbpe_prefixado',
      nome: 'SBPE — prefixado',
      descricao:
        'Taxa fixa, sem atualização por TR ou IPCA. A parcela varia apenas pelo sistema de amortização.',
      parametrosManuais: false,
      operacoes: ['aquisicao_novo', 'aquisicao_usado'],
      tiposImovel: ['residencial', 'comercial'],
      ufs: null,
      faixaRenda: oficial(
        { min: 0, max: null },
        'CAIXA — financiamento de imóveis',
        CAIXA_NOVO,
        VERIFICADO_EM,
        'Sem faixa de renda; o limite é a capacidade de pagamento.',
      ),
      valorImovelMax: pendente<number>(A_CONFIRMAR('O valor máximo do imóvel', 'caixa.gov.br')),
      quotaMaxPct: pendente<number>(
        A_CONFIRMAR('A quota da modalidade prefixada', 'caixa.gov.br'),
      ),
      entradaMinimaPct: pendente<number>(A_CONFIRMAR('A entrada mínima', 'caixa.gov.br')),
      prazoMaxMeses: pendente<number>(
        A_CONFIRMAR('O prazo máximo da modalidade prefixada', 'caixa.gov.br'),
      ),
      taxaAnualPct: pendente<number>(
        'A taxa da modalidade prefixada é definida na proposta. Peça ao correspondente e use "Condições informadas", ou cadastre aqui.',
      ),
      regimeTaxa: 'nominal',
      permiteCarencia: pendente<boolean>(A_CONFIRMAR('A possibilidade de carência', 'caixa.gov.br')),
      carenciaMaxMeses: pendente<number>(A_CONFIRMAR('O prazo máximo de carência', 'caixa.gov.br')),
      comprometimentoRendaMaxPct: oficial(
        30,
        'CAIXA — perguntas frequentes',
        CAIXA_FAQ,
        VERIFICADO_EM,
        `A prestação pode comprometer até 30% da renda familiar bruta em determinadas operações. ${VIA_MANUAL}`,
      ),
      idadeMaisPrazoMaxAnos: pendente<number>(
        A_CONFIRMAR('O limite de idade somada ao prazo', 'caixa.gov.br'),
      ),
      subsidioMax: oficial(0, 'CAIXA', CAIXA_NOVO, VERIFICADO_EM, 'Sem subsídio.'),
      sistemas: ['SAC', 'PRICE'],
      indexadorId: 'NONE',
      fonte: 'CAIXA — Aquisição de imóvel novo',
      fonteUrl: CAIXA_NOVO,
    },
  ],

  seguros: {
    mipPorIdade: pendente<import('./seguros').FaixaMip[]>(
      'A tábua do MIP por faixa etária é definida na APÓLICE da seguradora, não pela CAIXA. Sem ela, a prestação é apresentada SEM o seguro de morte e invalidez — e o resultado diz isso, em vez de somar um número que ninguém confirmou. Cadastre as faixas em Ajustes → Financiamento → Regras quando tiver a apólice.',
    ),
    dfiPctMensalSobreAvaliacao: pendente<number>(
      'A taxa do DFI (danos físicos ao imóvel) é definida na apólice e incide sobre o valor de avaliação. Sem ela, a prestação sai SEM o seguro do imóvel.',
    ),
    tarifaAdminMensal: pendente<number>(
      'A tarifa de administração varia por tipo de financiamento e por enquadramento (SFH/SFI). O material verificado é explícito em não haver valor universal. Confirme no contrato ou com o correspondente.',
    ),
  },

  fgts: {
    permitidoNaEntrada: oficial(
      true,
      'CAIXA — financiamento de imóveis',
      CAIXA_NOVO,
      VERIFICADO_EM,
      `O FGTS pode ser utilizado conforme as regras do Fundo. ${VIA_MANUAL}`,
    ),
    condicoes: [
      'O uso do FGTS depende de análise da Caixa e das regras vigentes do Fundo (tempo de carteira, não possuir imóvel na mesma região, saldo na conta vinculada).',
      'O simulador SOMA o valor que você informar à entrada; ele não verifica se o cliente tem direito de usar.',
    ],
  },

  sfh: {
    limiteValorImovel: oficial(
      2250000,
      'CAIXA — financiamento de imóveis',
      CAIXA_NOVO,
      VERIFICADO_EM,
      `Referência de enquadramento SFH/SFI: até este valor de avaliação a operação é SFH; acima, SFI. ${VIA_MANUAL}`,
    ),
  },

  fonte: 'CAIXA — páginas oficiais de habitação',
  fonteUrl: CAIXA_NOVO,
  notas:
    'Versão semeada a partir do manual técnico do motor (consulta às páginas oficiais em 19/08/2026). Os parâmetros que dependem de apólice (MIP, DFI), de tarifa de contrato e de índices do Banco Central/IBGE continuam pendentes de validação — o motor não os inventa.',
};
