/**
 * OS BANCOS — a porta de entrada do simulador.
 *
 * ===========================================================================
 * POR QUE A PRIMEIRA PERGUNTA É "QUAL BANCO", E NÃO "QUAL LINHA"
 * ===========================================================================
 * O corretor não pensa em "MCMV Classe Média, SAC, TR, quota 80%". Ele pensa
 * "vou levar na Caixa". A linha, o sistema, o indexador, a quota, o teto de
 * renda e o comprometimento são **consequências** dessa escolha — e são
 * exatamente o tipo de coisa que ele não deveria precisar digitar, porque já
 * está cadastrada.
 *
 * Então a tela pergunta o banco. Escolhido o banco, tudo o que é regra daquele
 * banco entra sozinho e **não aparece na tela**. Sobram os campos que só o
 * corretor sabe: quanto custa o imóvel, quanto o cliente tem, quanto ele ganha
 * e em quantos anos.
 *
 * ===========================================================================
 * ESTE ARQUIVO NÃO GUARDA NENHUMA REGRA FINANCEIRA
 * ===========================================================================
 * Isto aqui é **identidade visual**: nome, cor e sigla. Taxa, prazo, quota e
 * faixa de renda continuam morando em `VersaoRegras`, versionadas, com fonte e
 * data de verificação — que é o que a especificação exige e o que permite
 * corrigi-las sem tocar em código.
 *
 * O vínculo entre os dois é o campo `bancoId` do produto. Um produto com
 * `bancoId: null` serve a qualquer banco: é o caso de "Condições informadas",
 * em que quem fornece os números é o correspondente bancário.
 *
 * ===========================================================================
 * POR QUE OS OUTROS BANCOS ENTRAM SEM TABELA
 * ===========================================================================
 * A §74 proíbe inventar taxa, quota ou prazo. Não temos as tabelas do BB, do
 * Itaú, do Bradesco ou do Santander — e não vamos chutar. Eles aparecem na
 * lista porque o corretor trabalha com eles de verdade, e ao escolhê-los o
 * simulador vai direto para "informe a condição aprovada": o cálculo é o mesmo
 * motor, com os números que vieram do correspondente.
 *
 * No dia em que a tabela de qualquer um deles for cadastrada em
 * `VersaoRegras` com `bancoId` apontando para cá, ele passa a ter linha
 * própria sem nenhuma mudança de código.
 */

/** O banco genérico: qualquer instituição para a qual só temos a condição informada. */
export const BANCO_OUTRO = 'outro';

export interface Banco {
  id: string;
  /** Como aparece no PDF e no contrato. */
  nome: string;
  /** A sigla da marca, para o selo de identificação. */
  sigla: string;
  /** Cor da marca — usada só no selo. */
  cor: string;
  /** Cor do texto sobre `cor`. */
  corTexto: string;
  /** Uma linha explicando quando esse banco é o caminho. */
  linha: string;
  /** Posição na lista. A Caixa é a primeira porque é a que financia a maior parte. */
  ordem: number;
}

/**
 * A Caixa vem primeiro, e não por ordem alfabética: é o agente operador do
 * FGTS e do Minha Casa Minha Vida, e a maioria absoluta das simulações de um
 * corretor residencial passa por ela.
 */
export const BANCOS: Banco[] = [
  {
    id: 'caixa',
    nome: 'Caixa Econômica Federal',
    sigla: 'CAIXA',
    cor: '#005CA9',
    corTexto: '#FFFFFF',
    linha: 'Minha Casa Minha Vida, SBPE e uso do FGTS',
    ordem: 1,
  },
  {
    id: 'bb',
    nome: 'Banco do Brasil',
    sigla: 'BB',
    cor: '#0038A8',
    corTexto: '#FFE000',
    linha: 'Informe a condição aprovada pelo correspondente',
    ordem: 2,
  },
  {
    id: 'itau',
    nome: 'Itaú Unibanco',
    sigla: 'Itaú',
    cor: '#EC7000',
    corTexto: '#FFFFFF',
    linha: 'Informe a condição aprovada pelo correspondente',
    ordem: 3,
  },
  {
    id: 'bradesco',
    nome: 'Bradesco',
    sigla: 'Bradesco',
    cor: '#CC092F',
    corTexto: '#FFFFFF',
    linha: 'Informe a condição aprovada pelo correspondente',
    ordem: 4,
  },
  {
    id: 'santander',
    nome: 'Santander',
    sigla: 'Santander',
    cor: '#EC0000',
    corTexto: '#FFFFFF',
    linha: 'Informe a condição aprovada pelo correspondente',
    ordem: 5,
  },
  {
    id: BANCO_OUTRO,
    nome: 'Outro banco',
    sigla: 'Outro',
    cor: '#475569',
    corTexto: '#FFFFFF',
    linha: 'Qualquer instituição — você informa taxa, prazo e quota',
    ordem: 99,
  },
];

export function acharBanco(id: string | null): Banco | null {
  if (!id) return null;
  return BANCOS.find((b) => b.id === id) ?? null;
}

/** O nome que vai para o PDF e para a proposta. */
export function nomeDoBanco(id: string | null): string {
  return acharBanco(id)?.nome ?? 'Instituição informada';
}
