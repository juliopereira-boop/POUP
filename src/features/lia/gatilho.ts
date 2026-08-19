/**
 * VALE A PENA CHAMAR O MODELO POR ISTO?
 *
 * ===========================================================================
 * POR QUE ESTE FILTRO EXISTE
 * ===========================================================================
 * Numa negociação de verdade, boa parte do que o microfone capta não contém
 * nenhum dado da simulação: cumprimento, conversa sobre trânsito, "pois é",
 * "com certeza", o corretor explicando como funciona o financiamento. Mandar
 * cada um desses pedaços para o modelo custa dinheiro e devolve lista vazia.
 *
 * Este é o filtro mais barato que existe — roda no aparelho, em microssegundos,
 * e é o segundo maior corte de custo da LIA depois da cache. Ele elimina algo
 * como metade das chamadas sem tirar nada da qualidade, porque o que ele
 * descarta são exatamente os trechos em que o modelo não teria o que fazer.
 *
 * ===========================================================================
 * A REGRA DE OURO: ERRAR PARA O LADO DE CHAMAR
 * ===========================================================================
 * Um falso positivo custa uma fração de centavo. Um falso negativo perde um
 * dado da negociação e o corretor descobre isso quando a proposta sai errada.
 * Então a rede é grossa de propósito: qualquer dígito, qualquer número por
 * extenso, qualquer palavra do vocabulário do negócio, **ou** um trecho longo
 * o bastante para ser suspeito já passa.
 *
 * E nada disto vale para o FECHO: quando o corretor manda gerar a proposta, a
 * conversa inteira é relida sem filtro nenhum. Este arquivo só decide sobre as
 * rodadas intermediárias, que existem para a tela acompanhar.
 */

/** Números por extenso, incluindo os jeitos abreviados de falar dinheiro. */
const NUMEROS = [
  /*
   * "um" e "uma" ficam DE FORA, apesar de serem números.
   *
   * Em português eles são artigos antes de serem numerais, e aparecem em quase
   * toda frase de conversa fiada: "deixa eu ver um instante", "tem um cafezinho
   * ali". Deixá-los na lista fazia o gatilho aprovar exatamente o ruído que ele
   * existe para cortar. Nada se perde: o que importa de verdade — "um salário",
   * "um milhão" — passa pela outra palavra da expressão.
   */
  'zero',
  'dois',
  'duas',
  'tres',
  'quatro',
  'cinco',
  'seis',
  'sete',
  'oito',
  'nove',
  'dez',
  'onze',
  'doze',
  'treze',
  'quatorze',
  'catorze',
  'quinze',
  'dezesseis',
  'dezessete',
  'dezoito',
  'dezenove',
  'vinte',
  'trinta',
  'quarenta',
  'cinquenta',
  'sessenta',
  'setenta',
  'oitenta',
  'noventa',
  'cem',
  'cento',
  'duzentos',
  'trezentos',
  'quatrocentos',
  'quinhentos',
  'seiscentos',
  'setecentos',
  'oitocentos',
  'novecentos',
  'mil',
  'milhao',
  'milhoes',
  'meio',
  'meia',
];

/**
 * Retratação — o caso que o gatilho MAIS não pode perder.
 *
 * "Esquece o segundo proponente", "ele desistiu do financiamento", "mudou pro
 * bloco B". São frases que muitas vezes não têm número nenhum, e ainda assim
 * apagam ou trocam um dado já capturado. Deixá-las passar em silêncio deixaria
 * na tela um campo que a negociação já descartou — pior que nunca tê-lo
 * capturado, porque o corretor confia no que está preenchido.
 */
const RETRATACAO = [
  'esquece',
  'esquecer',
  'esqueca',
  'desiste',
  'desistiu',
  'desistindo',
  'cancela',
  'cancelou',
  'mudou',
  'mudei',
  'muda',
  'trocou',
  'troca',
  'corrige',
  'corrigir',
  'risca',
  'errado',
  'errei',
  'verdade',
  'proponente',
  'titular',
  'comprador',
];

/**
 * O vocabulário do negócio.
 *
 * Não é a lista de campos: é a lista de palavras que APARECEM quando alguém
 * fala de um campo. "Ganha" não é um campo, mas quem diz "ganha" está falando
 * de renda.
 */
const VOCABULARIO = [
  // imóvel
  'apartamento',
  'apto',
  'casa',
  'lote',
  'unidade',
  'bloco',
  'quadra',
  'torre',
  'empreendimento',
  'residencial',
  'condominio',
  'valor',
  'preco',
  'tabela',
  'custa',
  'imovel',
  // cliente
  'nome',
  'chamo',
  'sobrenome',
  'cpf',
  'rg',
  'telefone',
  'celular',
  'whatsapp',
  'email',
  'renda',
  'ganha',
  'ganho',
  'salario',
  'salarios',
  'holerite',
  'carteira',
  'autonomo',
  'esposa',
  'marido',
  'conjuge',
  'companheiro',
  'companheira',
  'mae',
  'pai',
  'irmao',
  'irma',
  'filho',
  'compor',
  'composicao',
  'fiador',
  'socio',
  // financiamento
  'financiamento',
  'financiar',
  'aprovado',
  'aprovou',
  'carta',
  'caixa',
  'subsidio',
  'fgts',
  'correspondente',
  'banco',
  // pagamento
  'entrada',
  'ato',
  'sinal',
  'parcela',
  'parcelas',
  'mensal',
  'mensais',
  'vezes',
  'semestral',
  'semestrais',
  'anual',
  'anuais',
  'balao',
  'reforco',
  'vencimento',
  'vence',
  'dia',
  'taxa',
  'juros',
  'desconto',
  'cupom',
  'pagar',
  'paga',
  'reais',
  'mil',
];

/**
 * Trecho longo passa mesmo sem palavra conhecida.
 *
 * É a rede de segurança contra o vocabulário estar incompleto: se alguém falou
 * bastante coisa, provavelmente disse algo que importa, e o custo de uma
 * chamada é menor que o de perder um dado.
 */
const PALAVRAS_SUSPEITAS = 45;

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const CONHECIDAS = new Set([...NUMEROS, ...VOCABULARIO, ...RETRATACAO]);

/**
 * @param extras Palavras do catálogo DESTE corretor (nomes de empreendimento e
 *   de correspondente), que contam como vocabulário conhecido.
 *
 *   Sem isto o filtro tinha um buraco grande: "é o connect, aquele ali" não tem
 *   dígito nem palavra do vocabulário fixo, então a janela era descartada e o
 *   modelo nunca via o nome do empreendimento — o campo que puxa empresa,
 *   gerente, comissão e prazo. O nome cadastrado é, por definição, uma palavra
 *   que importa nesta conversa; a lista fixa aqui em cima não tem como saber
 *   disso, porque ela é a mesma para todo mundo.
 */
export function valeAnalisar(trecho: string, extras?: ReadonlySet<string>): boolean {
  const limpo = normalizar(trecho);
  if (!limpo) return false;

  // Dígito é o sinal mais forte que existe numa conversa de simulação.
  if (/\d/.test(limpo)) return true;

  const palavras = limpo.split(' ');
  if (palavras.some((p) => CONHECIDAS.has(p) || extras?.has(p))) return true;

  return palavras.length >= PALAVRAS_SUSPEITAS;
}
