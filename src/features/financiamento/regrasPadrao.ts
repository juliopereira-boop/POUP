/**
 * A VERSÃO DE REGRAS QUE VEM DE FÁBRICA.
 *
 * ===========================================================================
 * LEIA ISTO ANTES DE MEXER
 * ===========================================================================
 * Quase todo número aqui está **pendente de validação**, e isso é a decisão
 * mais importante deste módulo — não um trabalho pela metade.
 *
 * Taxa de juros, teto de renda por faixa, valor máximo do imóvel, quota
 * financiável e prazo do Minha Casa Minha Vida e do SBPE são **condições
 * oficiais**, publicadas por normativo e reajustadas com frequência. Elas
 * precisam ser lidas na fonte, pelo administrador, no dia em que ele as
 * cadastrar. Qualquer número que eu escrevesse aqui viraria, no aplicativo, uma
 * condição com cara de oficial — que o corretor mostraria ao cliente e que o
 * banco desmentiria na mesa. É o pior defeito possível numa ferramenta de
 * venda, e não vale a conveniência de "já vir preenchido".
 *
 * Onde confirmar (as páginas oficiais da CAIXA):
 *   MCMV urbana .. https://www.caixa.gov.br/voce/habitacao/minha-casa-minha-vida/urbana/Paginas/default.aspx
 *   Imóvel novo .. https://www.caixa.gov.br/voce/habitacao/financiamento/aquisicao-imovel-novo/Paginas/default.aspx
 *   Imóvel usado . https://www.caixa.gov.br/voce/habitacao/financiamento/aquisicao-imovel-usado/Paginas/default.aspx
 *   Perguntas .... https://www.caixa.gov.br/voce/habitacao/financiamento/perguntas-frequentes/Paginas/default.aspx
 *
 * O caminho para preencher: **Ajustes → Financiamento → Regras** (só admin).
 * Cada campo pede o valor, a fonte e a data em que foi verificado, e a
 * alteração fica registrada na trilha de auditoria.
 *
 * ===========================================================================
 * E COMO O SIMULADOR FUNCIONA HOJE, ENTÃO?
 * ===========================================================================
 * Por causa do produto **"Condições informadas"**.
 *
 * Ele não depende de parâmetro oficial nenhum: a taxa, o prazo e a quota são
 * digitados pelo corretor na hora da simulação. E isso não é um plano B — é
 * como a venda realmente acontece. O correspondente bancário analisa o cliente
 * e devolve a condição APROVADA para aquele caso ("saiu 8,66% em 420 meses,
 * quota de 80%"), que quase nunca é a tabela genérica do site. O corretor
 * informa aquilo, e a matemática — que é exata e é nossa — faz o resto.
 *
 * Os produtos do MCMV e do SBPE já vêm modelados, com nome e estrutura, para
 * que preenchê-los seja só digitar os números. Enquanto estiverem pendentes,
 * eles aparecem na tela **desabilitados, com o motivo**, em vez de sumirem: o
 * corretor precisa saber que a linha existe e o que falta para ela funcionar.
 */
import type { ProdutoFinanciamento, VersaoRegras } from './regras';
import { estimativa, pendente } from './regras';

const CAIXA_MCMV =
  'https://www.caixa.gov.br/voce/habitacao/minha-casa-minha-vida/urbana/Paginas/default.aspx';
const CAIXA_NOVO =
  'https://www.caixa.gov.br/voce/habitacao/financiamento/aquisicao-imovel-novo/Paginas/default.aspx';

const A_CONFIRMAR = (o_que: string, onde: string) =>
  `${o_que} é condição oficial e muda por normativo. Confirme em ${onde} e cadastre em Ajustes → Financiamento → Regras.`;

/**
 * O esqueleto de um produto do MCMV.
 *
 * Os nomes das faixas são estáveis o bastante para virem prontos — o que muda
 * é o CONTEÚDO de cada faixa, e é exatamente isso que está pendente.
 */
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
      A_CONFIRMAR('O teto de renda bruta familiar da faixa', 'caixa.gov.br (MCMV urbana)'),
    ),
    valorImovelMax: pendente<number>(
      A_CONFIRMAR('O valor máximo do imóvel na faixa', 'caixa.gov.br (MCMV urbana)'),
    ),
    quotaMaxPct: pendente<number>(
      A_CONFIRMAR('O percentual financiável', 'caixa.gov.br (MCMV urbana)'),
    ),
    prazoMaxMeses: pendente<number>(A_CONFIRMAR('O prazo máximo', 'caixa.gov.br (MCMV urbana)')),
    taxaAnualPct: pendente<number>(
      A_CONFIRMAR('A taxa de juros da faixa', 'caixa.gov.br (MCMV urbana)'),
    ),
    comprometimentoRendaMaxPct: pendente<number>(
      A_CONFIRMAR('O comprometimento máximo de renda', 'caixa.gov.br'),
    ),
    idadeMaisPrazoMaxAnos: pendente<number>(
      A_CONFIRMAR('O limite de idade do proponente somada ao prazo', 'caixa.gov.br'),
    ),
    subsidioMax: pendente<number>(
      A_CONFIRMAR('O teto do subsídio (desconto) da faixa', 'caixa.gov.br (MCMV urbana)'),
    ),
    sistemas: ['SAC', 'PRICE'],
    indexadorId: 'TR',
    fonte: 'CAIXA — Minha Casa, Minha Vida (urbana)',
    fonteUrl: CAIXA_MCMV,
  };
}

export const VERSAO_PADRAO = '0000.00';

/**
 * A versão de fábrica.
 *
 * O número `0000.00` é deliberadamente inválido como "regra de um mês": ele
 * grita, na tela do admin e no rodapé do PDF, que ninguém cadastrou uma versão
 * oficial ainda. Uma versão chamada "2026.08" que estivesse pendente por dentro
 * seria muito mais perigosa.
 */
export const REGRAS_PADRAO: VersaoRegras = {
  versao: VERSAO_PADRAO,
  vigenciaInicio: '1970-01-01',
  vigenciaFim: null,
  status: 'ativa',

  /*
   * Composta é a convenção que preserva a taxa EFETIVA anual: doze meses
   * compostos devolvem exatamente a taxa informada. É a leitura mais comum em
   * crédito imobiliário brasileiro, mas quem manda é o contrato — por isso ela
   * é parâmetro da versão, e o administrador pode trocar para `linear`.
   */
  conversaoTaxa: 'composta',

  indexadores: [
    {
      id: 'FIXA',
      nome: 'Taxa fixa',
      descricao: 'Sem correção monetária. A prestação só varia pelo sistema de amortização.',
      projecaoMensal: estimativa(
        0,
        'Taxa fixa não tem indexador por definição: a correção mensal é zero.',
      ),
    },
    {
      id: 'TR',
      nome: 'TR — Taxa Referencial',
      descricao: 'Indexador tradicional do crédito imobiliário. O saldo devedor é corrigido por ela.',
      projecaoMensal: pendente<number>(
        'Projetar a TR é previsão econômica, não é dado da CAIXA. Sem projeção cadastrada, a simulação sai SEM correção monetária e diz isso no resultado.',
      ),
    },
    {
      id: 'IPCA',
      nome: 'IPCA',
      descricao: 'Correção pela inflação oficial.',
      projecaoMensal: pendente<number>(
        'Projetar o IPCA é previsão econômica. Sem projeção cadastrada, a simulação sai SEM correção monetária.',
      ),
    },
    {
      id: 'POUPANCA',
      nome: 'Poupança + taxa fixa',
      descricao: 'Linha corrigida pelo rendimento da caderneta de poupança.',
      projecaoMensal: pendente<number>(
        'O rendimento da poupança acompanha a Selic e a TR. Sem projeção cadastrada, a simulação sai SEM correção monetária.',
      ),
    },
  ],

  produtos: [
    /*
     * O PRODUTO QUE SEMPRE FUNCIONA.
     *
     * Vem primeiro porque é o padrão da tela: é o que o corretor usa no dia a
     * dia, com a condição que o correspondente aprovou para AQUELE cliente.
     */
    {
      id: 'informado',
      nome: 'Condições informadas',
      descricao:
        'Você informa a taxa, o prazo e a quota que o correspondente bancário passou para este cliente. É a condição real da negociação — o cálculo é feito em cima dela.',
      parametrosManuais: true,
      operacoes: ['aquisicao_novo', 'aquisicao_usado', 'construcao', 'terreno_e_construcao'],
      tiposImovel: ['residencial', 'comercial'],
      ufs: null,
      faixaRenda: estimativa({ min: 0, max: null }, 'Sem faixa: quem informa a condição é você.'),
      valorImovelMax: estimativa(
        0,
        'Sem teto de valor: o limite é a condição informada, não uma faixa de programa.',
      ),
      quotaMaxPct: estimativa(100, 'Você informa a quota aprovada na simulação.'),
      prazoMaxMeses: estimativa(420, 'Você informa o prazo aprovado; 420 meses é só o teto do campo.'),
      taxaAnualPct: estimativa(0, 'Você informa a taxa aprovada na simulação.'),
      comprometimentoRendaMaxPct: estimativa(
        30,
        'Referência de mercado para o alerta de renda. NÃO é regra da CAIXA — é o limite que o simulador usa para avisar que a parcela ficou pesada, e o administrador pode ajustar.',
      ),
      idadeMaisPrazoMaxAnos: pendente<number>(
        A_CONFIRMAR('O limite de idade somada ao prazo', 'caixa.gov.br'),
      ),
      subsidioMax: estimativa(0, 'Subsídio, quando houver, é informado como valor na simulação.'),
      sistemas: ['SAC', 'PRICE'],
      indexadorId: 'FIXA',
      fonte: null,
      fonteUrl: null,
    },

    faixaMcmv('mcmv_1', 'MCMV Faixa 1', 'Menor renda, com subsídio e as menores taxas do programa.'),
    faixaMcmv('mcmv_2', 'MCMV Faixa 2', 'Renda baixa, ainda com subsídio.'),
    faixaMcmv('mcmv_3', 'MCMV Faixa 3', 'Renda média, com taxa reduzida e sem subsídio.'),
    faixaMcmv(
      'mcmv_4',
      'MCMV Faixa 4',
      'Faixa criada para a classe média: sem subsídio, com juros abaixo do mercado tradicional.',
    ),

    {
      id: 'sbpe',
      nome: 'SBPE — financiamento tradicional',
      descricao:
        'Fora do MCMV, para quem passa do teto de renda ou compra imóvel acima do limite do programa.',
      parametrosManuais: false,
      operacoes: ['aquisicao_novo', 'aquisicao_usado', 'construcao', 'terreno_e_construcao'],
      tiposImovel: ['residencial', 'comercial'],
      ufs: null,
      faixaRenda: estimativa(
        { min: 0, max: null },
        'O SBPE não tem faixa de renda: o limite é a capacidade de pagamento, verificada pelo comprometimento de renda.',
      ),
      valorImovelMax: pendente<number>(
        A_CONFIRMAR('O valor máximo do imóvel no SBPE', 'caixa.gov.br (imóvel novo/usado)'),
      ),
      quotaMaxPct: pendente<number>(
        A_CONFIRMAR('O percentual financiável do SBPE', 'caixa.gov.br (imóvel novo/usado)'),
      ),
      prazoMaxMeses: pendente<number>(A_CONFIRMAR('O prazo máximo do SBPE', 'caixa.gov.br')),
      taxaAnualPct: pendente<number>(
        A_CONFIRMAR('A taxa do SBPE (varia por relacionamento com o banco)', 'caixa.gov.br'),
      ),
      comprometimentoRendaMaxPct: pendente<number>(
        A_CONFIRMAR('O comprometimento máximo de renda', 'caixa.gov.br'),
      ),
      idadeMaisPrazoMaxAnos: pendente<number>(
        A_CONFIRMAR('O limite de idade somada ao prazo', 'caixa.gov.br'),
      ),
      subsidioMax: estimativa(0, 'O SBPE não tem subsídio do programa habitacional.'),
      sistemas: ['SAC', 'PRICE'],
      indexadorId: 'TR',
      fonte: 'CAIXA — Aquisição de imóvel novo',
      fonteUrl: CAIXA_NOVO,
    },
  ],

  encargos: {
    mipPctMensalSobreSaldo: pendente<number>(
      'O MIP (seguro de morte e invalidez) depende da idade do proponente e da tábua atuarial da seguradora. Sem o parâmetro, a prestação é apresentada SEM o seguro, e o resultado diz isso.',
    ),
    dfiPctMensalSobreImovel: pendente<number>(
      'O DFI (danos físicos ao imóvel) depende do imóvel e da apólice. Sem o parâmetro, a prestação é apresentada SEM o seguro.',
    ),
    tarifaAdminMensal: pendente<number>(
      'A tarifa de administração do contrato varia por instituição e por contrato. Confirme no contrato ou com o correspondente e cadastre em Ajustes → Financiamento → Regras.',
    ),
  },

  fgts: {
    permitidoNaEntrada: estimativa(
      true,
      'O FGTS pode compor a entrada nas condições da legislação (tempo de carteira, não possuir imóvel na mesma região etc.). O simulador apenas SOMA o valor que você informar à entrada — quem valida o direito de uso é a Caixa.',
    ),
    condicoes: [
      'O uso do FGTS depende de análise da Caixa e das regras vigentes do Fundo.',
      'O simulador soma o valor informado à entrada; ele não verifica se o cliente tem direito.',
    ],
  },

  fonte: null,
  fonteUrl: null,
  notas:
    'Versão de fábrica. Os parâmetros oficiais do MCMV e do SBPE ainda não foram cadastrados — até lá, use o produto "Condições informadas", que trabalha com a condição aprovada pelo correspondente bancário.',
};
