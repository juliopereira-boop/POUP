/**
 * O CÉREBRO DA LIA — DO TEXTO DA NEGOCIAÇÃO AOS CAMPOS DA SIMULAÇÃO.
 *
 * ===========================================================================
 * O QUE ELE FAZ (O MESMO QUE O MODELO FAZIA, E MAIS)
 * ===========================================================================
 * Recebe o que o corretor digitou ("cliente Maria Souza, ganha 2.800, quer o
 * estrelas bloco 3 apto 204, entrada de 5 mil dia 10, 36 vezes vencendo todo
 * dia 15") e devolve os campos que a tela e o simulador já entendem — no
 * MESMO formato que a Edge Function devolvia (`CampoOuvido`), para nada do
 * resto do aplicativo mudar.
 *
 * Em etapas, cada uma apagando do texto o que já usou (sem mudar posições,
 * para o trecho de prova sair certo do original):
 *
 *   1. e-mail, CPF e telefone — os mais inconfundíveis;
 *   2. bloco e unidade;
 *   3. datas: dia do vencimento da mensal e data do ato;
 *   4. quantidades: mensais, semestrais e anuais (com o valor de cada reforço);
 *   5. "um salário", "dois salários e meio";
 *   6. dinheiro: cada número vai para a palavra-chave mais perto dele ("renda",
 *      "entrada", "aprovou", "subsídio", "FGTS", "valor", "parcela da Caixa"),
 *      respeitando de QUEM é a renda (titular ou segundo proponente);
 *   7. nomes: do cliente e do segundo proponente;
 *   8. empreendimento e correspondente, pelo cadastro;
 *   9. sim/não: segundo proponente, taxa da Caixa;
 *  10. correções ("na verdade 3.500", "não é 3 mil, é 3.500") e remoções
 *      ("esquece o segundo proponente", "sem FGTS").
 *
 * ===========================================================================
 * AS REGRAS QUE NÃO MUDARAM
 * ===========================================================================
 * - NÃO INVENTA. Número sem palavra que diga o que ele é não vira campo — vira
 *   aviso, com a sugestão de como escrever.
 * - O QUE VEIO DEPOIS MANDA. Dois valores para o mesmo campo: fica o último.
 * - NA DÚVIDA, PERGUNTA. Empreendimento que casa com dois vira pergunta.
 * - CONFIANÇA HONESTA. "alta" quando estava escrito; "media" quando foi
 *   deduzido ("renda 3,5" virou R$ 3.500; o CPF veio do cadastro do cliente);
 *   "baixa" quando é bom conferir (CPF que não fecha os dígitos).
 */
import { acharNoTexto, acharPorPrimeiroNome, type ItemDoCatalogo } from './catalogo';
import { acharDatas } from './datas';
import {
  SALARIO_MINIMO,
  acharNumeros,
  emReais,
  inteiroDe,
  type NumeroNoTexto,
  type TipoDeValor,
} from './numeros';
import { apagar, normalizar, normalizarMesmoTamanho, trechoEmVolta } from './texto';

export type Confianca = 'alta' | 'media' | 'baixa';

export interface CampoDoCerebro {
  chave: string;
  valor: string;
  trecho: string;
  confianca: Confianca;
}

export interface ClienteDoCadastro extends ItemDoCatalogo {
  cpf?: string | null;
  telefone?: string | null;
  email?: string | null;
  renda?: number | null;
}

export interface EntradaDoCerebro {
  texto: string;
  /** Hoje, AAAA-MM-DD, pelas partes locais do aparelho. */
  hoje: string;
  /** O que já foi capturado (chave → valor). */
  estado?: Record<string, string>;
  empreendimentos?: ItemDoCatalogo[];
  correspondentes?: ItemDoCatalogo[];
  /** A carteira de clientes: nome casado aqui traz CPF, telefone e renda. */
  clientes?: ClienteDoCadastro[];
  /** O campo que a LIA acabou de pedir: resposta curta ("3.500") vai para ele. */
  pendente?: string | null;
}

export interface SaidaDoCerebro {
  campos: CampoDoCerebro[];
  remover: string[];
  observacao: string | null;
}

// ---------------------------------------------------------------- vocabulário

/** Quem é o segundo proponente. A chave é o vínculo que vai para o simulador. */
const VINCULOS: [RegExp, 'conjuge' | 'parente' | 'fiador' | 'socio'][] = [
  [/\b(?:esposa|esposo|marido|companheir[oa]|conjuge|noiv[oa]|namorad[oa]|(?:minha|sua|a|dele) mulher|mulher dele|mulher do cliente)\b/g, 'conjuge'],
  [/\b(?:mae|pai|irma|irmao|filh[oa]|sogr[oa]|cunhad[oa]|tia|tio|avo|prim[oa]|sobrinh[oa]|entead[oa])\b/g, 'parente'],
  [/\bfiador[a]?\b/g, 'fiador'],
  [/\bsoci[oa]\b/g, 'socio'],
];

const SEGUNDO_EXPLICITO = /\b(?:segund[oa] proponente|2o proponente|2 proponente|segundo comprador|segunda compradora|outro proponente|outra proponente|compor renda|composicao de renda|compoe renda|vai compor|comprar junto|compra junto|em conjunto)\b/;
const MARCA_TITULAR = /\b(?:cliente|titular|comprador|compradora|primeiro proponente|proponente principal)\b/g;

const MARCA_CORRECAO = /\b(?:na verdade|corrigindo|correcao|corrige|corrigir|errei|quer dizer|ou melhor|alias|mudou para|mudou pra|agora e|passa a ser|passou para|passou pra|troca para|troca pra|altera para|altera pra|na real|atualiza para|atualiza pra)\b/;

interface Ancora {
  campo: string;
  tipo: TipoDeValor;
  re: RegExp;
}

/** Ordem importa: a primeira que pegar um trecho o reserva (ex.: "parcela do financiamento"). */
const ANCORAS: Ancora[] = [
  { campo: 'cefParcela', tipo: 'parcela', re: /\b(?:parcela|prestacao|mensalidade)s?\s+(?:da|na|do|no|com a|pra|para a)\s+(?:caixa|cef|banco|financiamento)\b|\b(?:parcela|prestacao)\s+(?:cef|caixa)\b/g },
  { campo: 'subsidio', tipo: 'entrada', re: /\bsubsidios?\b/g },
  { campo: 'fgts', tipo: 'entrada', re: /\b(?:fgts|fundo de garantia)\b/g },
  { campo: 'financiamentoAprovado', tipo: 'imovel', re: /\b(?:aprovou|aprovado|aprovada|aprovacao|financiamento|financiado|financiada|financia|carta de credito|carta|credito aprovado)\b/g },
  { campo: 'ato', tipo: 'entrada', re: /\b(?:ato|entrada|sinal)\b/g },
  { campo: 'clienteRenda', tipo: 'renda', re: /\b(?:renda bruta|renda familiar|renda|rendas|ganha|ganho|ganham|ganhamos|recebe|recebo|recebem|faturamento|fatura|salario)\b/g },
  { campo: 'valorUnidade', tipo: 'imovel', re: /\b(?:valor (?:do|da) (?:imovel|unidade|apartamento|apto|ap|casa|lote)|valor de tabela|valor de venda|valor da venda|preco|custa|custando|tabela|imovel|apartamento|apto|unidade|casa|lote|vale|valor)\b/g },
];

/** Palavras que encerram um nome (o que vem depois já é outro assunto). */
const FIM_DE_NOME = new Set([
  'renda', 'ganha', 'ganho', 'recebe', 'cpf', 'telefone', 'fone', 'celular', 'whats', 'whatsapp', 'email',
  'e-mail', 'quer', 'vai', 'tem', 'com', 'no', 'na', 'bloco', 'apto', 'apartamento', 'ap', 'unidade',
  'entrada', 'ato', 'fgts', 'subsidio', 'aprovou', 'aprovado', 'financiamento', 'valor', 'que', 'mas',
  'e', 'esposa', 'marido', 'mae', 'pai', 'filho', 'filha', 'para', 'pra', 'pro', 'do', 'dos', 'das',
  'mora', 'trabalha', 'casado', 'casada', 'solteiro', 'solteira', 'nasceu', 'idade', 'anos', 'segundo',
  'proponente', 'correspondente', 'parcela', 'parcelas', 'vezes', 'dia', 'ja', 'também', 'tambem',
]);
const CONECTORES_DE_NOME = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
const PALAVRAS_DE_NUMERO = new Set([
  'um', 'uma', 'dois', 'duas', 'tres', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze',
  'vinte', 'trinta', 'quarenta', 'cinquenta', 'cem', 'cento', 'duzentos', 'trezentos', 'quatrocentos',
  'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos', 'mil', 'milhao', 'meio', 'meia',
  'reais', 'salario', 'salarios',
]);
/** Palavras com maiúscula que não são nome de gente. */
const NAO_E_NOME = new Set([
  'caixa', 'cef', 'fgts', 'entrada', 'ato', 'renda', 'bloco', 'apto', 'apartamento', 'unidade', 'valor',
  'correspondente', 'cliente', 'subsidio', 'village', 'residencial', 'condominio', 'minha', 'casa', 'vida',
  'mcmv', 'pix', 'banco', 'atendi', 'hoje', 'amanha', 'ela', 'ele', 'quer', 'o', 'a', 'cpf', 'taxa',
]);

const PERGUNTAS: Record<string, string> = {
  empreendimento: 'Qual o empreendimento?',
  bloco: 'Qual o bloco? (ex.: "bloco 3")',
  unidade: 'Qual a unidade? (ex.: "apto 204")',
  valorUnidade: 'Qual o valor da unidade? (ex.: "valor 210 mil")',
  correspondente: 'Qual o correspondente bancário?',
  clienteNome: 'Qual o nome do cliente?',
  clienteRenda: 'Qual a renda bruta do cliente? (ex.: "renda 3.500")',
  clienteCpf: 'Qual o CPF do cliente?',
  clienteTelefone: 'Qual o telefone do cliente, com DDD?',
  financiamentoAprovado: 'Quanto a Caixa aprovou? (ex.: "aprovou 180 mil")',
  ato: 'Qual o valor da entrada? (ex.: "entrada 5 mil")',
  atoDataVencimento: 'Quando a entrada será paga? (ex.: "entrada dia 10")',
  mensaisQuantidade: 'Em quantas mensais? (ex.: "36 vezes")',
  mensalDiaVencimento: 'Em que dia vence a mensal? (ex.: "todo dia 15")',
};

/** A pergunta que a LIA faz para o campo que falta. */
export function perguntaPara(chave: string): string | null {
  return PERGUNTAS[chave] ?? null;
}

// ---------------------------------------------------------------- utilidades

export function cpfValido(digitos: string): boolean {
  if (!/^\d{11}$/.test(digitos) || /^(\d)\1{10}$/.test(digitos)) return false;
  const calc = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(digitos[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(digitos[9]) && calc(10) === Number(digitos[10]);
}

function titulo(nome: string): string {
  return nome
    .split(/\s+/)
    .map((p, i) => (i > 0 && CONECTORES_DE_NOME.has(p.toLowerCase()) ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()))
    .join(' ');
}

function todos(re: RegExp, texto: string): RegExpExecArray[] {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  const out: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = g.exec(texto))) {
    out.push(m);
    if (m[0].length === 0) g.lastIndex += 1;
  }
  return out;
}

/** Início e fim da frase (até . ; ! ? ou quebra de linha) em volta de `pos`. O ponto decimal ("3.500") não corta. */
function frase(normal: string, pos: number): { inicio: number; fim: number } {
  const corta = (k: number) => {
    const c = normal[k];
    if (c === undefined) return false;
    if (/[;!?\n]/.test(c)) return true;
    return c === '.' && !(/\d/.test(normal[k - 1] ?? '') && /\d/.test(normal[k + 1] ?? ''));
  };
  let i = pos;
  while (i > 0 && !corta(i - 1)) i -= 1;
  let f = pos;
  while (f < normal.length && !corta(f)) f += 1;
  return { inicio: i, fim: f };
}

/** Início da cláusula (vírgula que não é decimal, ou fim de frase) antes de `pos`. */
function inicioDaClausula(normal: string, pos: number): number {
  for (let i = pos - 1; i >= 0; i--) {
    const c = normal[i]!;
    if (/[;!?\n]/.test(c)) return i + 1;
    if ((c === ',' || c === '.') && !(/\d/.test(normal[i - 1] ?? '') && /\d/.test(normal[i + 1] ?? ''))) return i + 1;
  }
  return 0;
}

function temVirgulaEntre(normal: string, a: number, b: number): boolean {
  const trecho = normal.slice(Math.min(a, b), Math.max(a, b));
  return /,(?!\d)|(?<!\d),/.test(trecho);
}

// ---------------------------------------------------------------- o cérebro

export function pensar(entrada: EntradaDoCerebro): SaidaDoCerebro {
  const original = entrada.texto;
  const normal = normalizarMesmoTamanho(original);
  let livre = normal; // o que ainda não foi usado
  const estado = entrada.estado ?? {};
  const pendente = entrada.pendente ?? null;

  const campos = new Map<string, CampoDoCerebro>();
  const remover = new Set<string>();
  const avisos: string[] = [];
  let ultimoCampoDeDinheiro: { campo: string; tipo: TipoDeValor; pos: number } | null = null;

  const por = (chave: string, valor: string, inicio: number, fim: number, confianca: Confianca, trecho?: string) => {
    campos.set(chave, { chave, valor, trecho: trecho ?? trechoEmVolta(original, inicio, fim), confianca });
    remover.delete(chave);
  };
  const usar = (inicio: number, fim: number) => {
    livre = apagar(livre, inicio, fim);
  };

  // ---------------------------------------------------------------- vínculos
  const vinculos: { pos: number; fim: number; tipo: 'conjuge' | 'parente' | 'fiador' | 'socio' }[] = [];
  for (const [re, tipo] of VINCULOS) for (const m of todos(re, normal)) vinculos.push({ pos: m.index, fim: m.index + m[0].length, tipo });
  const marcasTitular = todos(MARCA_TITULAR, normal).map((m) => m.index);
  const marcasSegundo = [
    ...vinculos.map((v) => v.pos),
    ...todos(/\b(?:segund[oa] proponente|2o proponente|2 proponente|segundo comprador|segunda compradora|outr[oa] proponente)\b/, normal).map((m) => m.index),
  ];

  /** De quem é o dado na posição `pos`: a marca de pessoa mais perto antes dele, na mesma frase. */
  const dono = (pos: number): 'titular' | 'segundo' => {
    const f = frase(normal, pos);
    const antes = (lista: number[]) => Math.max(-1, ...lista.filter((p) => p >= f.inicio && p < pos));
    return antes(marcasSegundo) > antes(marcasTitular) ? 'segundo' : 'titular';
  };

  // ---------------------------------------------------------------- 1. e-mail
  for (const m of todos(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/, livre)) {
    por('clienteEmail', original.slice(m.index, m.index + m[0].length).toLowerCase(), m.index, m.index + m[0].length, 'alta');
    usar(m.index, m.index + m[0].length);
  }
  for (const m of todos(/\b([a-z0-9._-]+)\s+arroba\s+([a-z0-9-]+)((?:\s+ponto\s+[a-z]{2,})+)/, livre)) {
    const dominio = m[3]!.trim().split(/\s+ponto\s+/).filter(Boolean).join('.').replace(/^ponto\s+/, '');
    por('clienteEmail', `${m[1]}@${m[2]}.${dominio}`.replace(/\.+/g, '.'), m.index, m.index + m[0].length, 'media');
    usar(m.index, m.index + m[0].length);
  }

  // ------------------------------------------------------- 1. CPF e telefone
  let cpfsDoTitular = 0;
  for (const m of todos(/(?<![\d])(?:\+?55[\s.-]?)?\(?\d{2,3}\)?[\s.-]?\d[\d\s.-]{6,12}\d(?![\d])/, livre)) {
    const bruto = m[0];
    let dig = bruto.replace(/\D/g, '');
    if (dig.length >= 12 && dig.startsWith('55')) dig = dig.slice(2);
    if (dig.length !== 10 && dig.length !== 11) continue;
    const inicio = m.index;
    const fim = m.index + bruto.length;
    const antes = normal.slice(Math.max(0, inicio - 30), inicio);
    const formatoCpf = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(bruto.trim());
    const formatoFone = /\(|\d{4,5}-\d{4}$/.test(bruto.trim()) && !formatoCpf;
    // A palavra-chave MAIS PERTO decide: "cpf 390... tel 98 9..." — o "tel" é do segundo.
    const ultimo = (re: RegExp) => Math.max(-1, ...todos(re, antes).map((x) => x.index));
    const posCpf = ultimo(/\bcpf\b/);
    const posFone = ultimo(/\b(?:tel|telefone|fone|celular|cel|whats|whatsapp|zap|contato|numero)\b/);
    const falaCpf = posCpf > posFone;
    const falaFone = posFone > posCpf;
    let eCpf: boolean;
    if (falaCpf && dig.length === 11) eCpf = true;
    else if (falaFone) eCpf = false;
    else if (formatoCpf) eCpf = true;
    else if (formatoFone || dig.length === 10) eCpf = false;
    else eCpf = cpfValido(dig) || dig[2] !== '9';

    if (eCpf) {
      const valido = cpfValido(dig);
      const quem = dono(inicio) === 'segundo' || cpfsDoTitular > 0 ? 'segundoCpf' : 'clienteCpf';
      if (quem === 'clienteCpf') cpfsDoTitular += 1;
      por(quem, dig, inicio, fim, valido ? 'alta' : 'baixa');
      if (!valido) avisos.push(`O CPF ${bruto.trim()} não confere os dígitos. Confira.`);
    } else {
      por('clienteTelefone', dig, inicio, fim, 'alta');
    }
    usar(inicio, fim);
  }

  // ---------------------------------------------------------- 2. bloco e unidade
  for (const m of todos(/\b(?:sem bloco|nao tem bloco|bloco unico|sem quadra)\b/, livre)) {
    por('bloco', '0', m.index, m.index + m[0].length, 'alta');
    usar(m.index, m.index + m[0].length);
  }
  const NUM_PEQUENO: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, quinze: 15, vinte: 20, trinta: 30 };
  for (const m of todos(/\b(?:bloco|bl|quadra|qd|torre)\.?\s*(?:n[o°º]?\.?\s*)?(\d{1,3}|[a-z]\b|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|quinze|vinte|trinta)(?!\s*(?:mil|reais|k)\b)/, livre)) {
    const v = m[1]!;
    let n: number | null = null;
    if (/^\d+$/.test(v)) n = Number(v);
    else if (v in NUM_PEQUENO) n = NUM_PEQUENO[v]!;
    else if (/^[a-z]$/.test(v) && !(v === 'a' && /^\s+ser\b/.test(normal.slice(m.index + m[0].length)))) n = v.charCodeAt(0) - 96;
    if (n === null || n > 100) continue;
    por('bloco', String(n), m.index, m.index + m[0].length, /^[a-z]$/.test(v) ? 'media' : 'alta');
    usar(m.index + m[0].length - v.length, m.index + m[0].length);
  }
  for (const m of todos(/\b(?:apartamento|apto|ap|unidade|und|uh|casa|lote|sala)\.?\s*(?:n[o°º]?\.?\s*|numero\s*|#\s*)?(\d{1,5}[a-z]?)\b(?![.,]\d)(?!\s*(?:mil|reais|k|quartos?|dormitorios?|suites?|vagas?|banheiros?|m2|metros|m²)\b)/, livre)) {
    if (/\bvalor\s+d[ao]\s*$/.test(normal.slice(Math.max(0, m.index - 12), m.index))) continue;
    const cod = original.slice(m.index + m[0].length - m[1]!.length, m.index + m[0].length).toUpperCase();
    por('unidade', cod, m.index, m.index + m[0].length, 'alta');
    usar(m.index + m[0].length - m[1]!.length, m.index + m[0].length);
  }

  // ------------------------------------------------ 3. vencimento da mensal
  const MES = '(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)';
  for (const m of todos(new RegExp(`\\b(?:vence|vencem|vencimento|vencendo|vencer|todo dia|todos os dias|dia de pagamento|dia do vencimento|pagamento todo dia|paga todo dia|pagando todo dia)\\b(?:\\s+(?:no|em|todo|sempre|as|parcelas?|mensais|mensal|da|do|de|dia|mes))*\\s+(\\d{1,2})\\b(?!\\s*(?:[/-]|de\\s+${MES}|mil|reais|vezes|parcelas|x\\b))`), livre)) {
    const n = Number(m[1]);
    const antes = normal.slice(inicioDaClausula(normal, m.index), m.index);
    if (/\b(?:ato|entrada|sinal)\b/.test(antes) && !/\b(?:mensa|parcela)/.test(antes)) continue; // é a data do ato
    if (n < 1 || n > 31) continue;
    por('mensalDiaVencimento', String(n), m.index, m.index + m[0].length, 'alta');
    usar(m.index, m.index + m[0].length);
  }
  for (const m of todos(/\bdia\s+(\d{1,2})\s+de\s+cada\s+mes\b/, livre)) {
    por('mensalDiaVencimento', String(Number(m[1])), m.index, m.index + m[0].length, 'alta');
    usar(m.index, m.index + m[0].length);
  }

  // ------------------------------------------------------- 3. data do ato
  for (const d of acharDatas(livre, entrada.hoje)) {
    const f = frase(normal, d.inicio);
    const antes = normal.slice(Math.max(f.inicio, d.inicio - 45), d.inicio);
    const depois = normal.slice(d.fim, Math.min(f.fim, d.fim + 25));
    const doAto = /\b(?:ato|entrada|sinal|assinatura|assina|assinar)\b/.test(antes) || /^\s*(?:,\s*)?(?:a |o )?(?:ato|entrada|sinal)\b/.test(depois);
    if (doAto || (pendente === 'atoDataVencimento' && !campos.has('atoDataVencimento'))) {
      por('atoDataVencimento', d.iso, d.inicio, d.fim, doAto ? 'alta' : 'media');
      usar(d.inicio, d.fim);
    }
  }

  // ---------------------------------------------------- 4. quantidades
  const numeros = () => acharNumeros(livre);

  for (const n of numeros()) {
    const q = inteiroDe(n);
    if (q === null || n.moeda) continue;
    const seg = livre.slice(n.fim, n.fim + 45);
    const reforco = /^\s*(?:x\s+)?(?:parcelas?\s+|baloes?\s+|reforcos?\s+|intercaladas?\s+|pagamentos?\s+)?(semestra|anua|anuidade)/.exec(seg);
    if (reforco) {
      const semestral = reforco[1] === 'semestra';
      const chaveQtd = semestral ? 'semestraisQuantidade' : 'anuaisQuantidade';
      const max = semestral ? 60 : 30;
      if (q >= 1 && q <= max) {
        por(chaveQtd, String(q), n.inicio, n.fim + reforco[0].length, 'alta');
        usar(n.inicio, n.fim);
      }
      continue;
    }
    const mensal = /^\s*(?:x\b|vezes\b|parcelas\b|mensais\b|mensalidades\b|prestacoes\b|meses\b)/.exec(seg);
    const antesDaQtd = livre.slice(inicioDaClausula(livre, n.inicio), n.inicio);
    if (mensal && /\b(?:ato|entrada|sinal)\b/.test(antesDaQtd) && !/\b(?:mensa|parcelas|resto|saldo)/.test(antesDaQtd)) {
      avisos.push(`A entrada parcelada ("${original.slice(n.inicio, n.fim + mensal[0].length).trim()}") não é um campo da simulação: ajuste o ato direto no simulador.`);
      usar(n.inicio, n.fim);
      continue;
    }
    if (mensal && q >= 1 && q <= 420) {
      por('mensaisQuantidade', String(q), n.inicio, n.fim + mensal[0].length, 'alta');
      usar(n.inicio, n.fim);
    }
  }
  // O valor de cada reforço: "semestral de 5 mil", "4 anuais de 8 mil".
  for (const m of todos(/\b(semestra|anua|anuidade)[a-z]*\b/, livre)) {
    const semestral = m[1] === 'semestra';
    const n = numeros().find((x) => x.inicio > m.index && x.inicio - (m.index + m[0].length) <= 22);
    if (!n) continue;
    const r = emReais(n, 'entrada');
    if (!r) continue;
    por(semestral ? 'semestralValor' : 'anualValor', String(r.valor), m.index, n.fim, r.deduzido ? 'media' : 'alta');
    usar(n.inicio, n.fim);
  }

  // ------------------------------------------------ 5. "um salário e meio"
  for (const m of todos(/\b(\d+(?:,\d)?|um|uma|dois|duas|tres|quatro|cinco)\s+salarios?(?:\s+minimos?)?(\s+e\s+meio)?\b/, livre)) {
    const qtd = /\d/.test(m[1]!) ? Number(m[1]!.replace(',', '.')) : NUM_PEQUENO[m[1]!]!;
    const valor = Math.round((qtd + (m[2] ? 0.5 : 0)) * SALARIO_MINIMO * 100) / 100;
    const quem = dono(m.index) === 'segundo' ? 'segundoRenda' : 'clienteRenda';
    por(quem, String(valor), m.index, m.index + m[0].length, 'media');
    usar(m.index, m.index + m[0].length);
  }

  // ------------------------------------------------------------ 6. dinheiro
  // "não é 3 mil, é 3.500": o número negado não vale nada.
  const negados = new Set<number>();
  for (const n of numeros()) {
    if (/\b(?:nao|nem)\s+(?:e|eh|sao|era|foi|seria|mais)?\s*(?:de\s+)?(?:r\$\s*)?$/.test(livre.slice(Math.max(0, n.inicio - 18), n.inicio))) negados.add(n.inicio);
  }

  interface AncoraNoTexto { campo: string; tipo: TipoDeValor; inicio: number; fim: number }
  const ancoras: AncoraNoTexto[] = [];
  let mascaraAncoras = livre;
  for (const a of ANCORAS) {
    for (const m of todos(a.re, mascaraAncoras)) {
      ancoras.push({ campo: a.campo, tipo: a.tipo, inicio: m.index, fim: m.index + m[0].length });
      mascaraAncoras = apagar(mascaraAncoras, m.index, m.index + m[0].length);
    }
  }

  const nums = numeros().filter((n) => !negados.has(n.inicio));
  const pares: { a: AncoraNoTexto; n: NumeroNoTexto; d: number }[] = [];
  for (const n of nums) {
    for (const a of ancoras) {
      const fA = frase(normal, a.inicio);
      if (n.inicio < fA.inicio || n.inicio > fA.fim) continue;
      let d: number;
      if (a.fim <= n.inicio) d = n.inicio - a.fim;
      else if (n.fim <= a.inicio) d = (a.inicio - n.fim) * 1.3 + 2;
      else continue;
      if (d > 45) continue;
      if (temVirgulaEntre(normal, a.fim <= n.inicio ? a.fim : n.fim, a.fim <= n.inicio ? n.inicio : a.inicio)) d += 25;
      pares.push({ a, n, d });
    }
  }
  pares.sort((x, y) => x.d - y.d);
  const ancoraUsada = new Set<AncoraNoTexto>();
  const numeroUsado = new Set<NumeroNoTexto>();
  const atribuicoes: { campo: string; tipo: TipoDeValor; n: NumeroNoTexto; valor: number; confianca: Confianca; inicioAncora: number }[] = [];
  for (const { a, n, d } of pares) {
    if (ancoraUsada.has(a) || numeroUsado.has(n)) continue;
    const r = emReais(n, a.tipo);
    if (!r) continue;
    let campo = a.campo;
    if (campo === 'clienteRenda' && dono(Math.min(a.inicio, n.inicio)) === 'segundo') campo = 'segundoRenda';
    ancoraUsada.add(a);
    numeroUsado.add(n);
    atribuicoes.push({ campo, tipo: a.tipo, n, valor: r.valor, confianca: r.deduzido || d > 25 ? 'media' : 'alta', inicioAncora: a.inicio });
  }
  // Na ordem do texto: o que veio depois manda.
  atribuicoes.sort((x, y) => x.n.inicio - y.n.inicio);
  let rendasDoTitular = 0;
  for (const at of atribuicoes) {
    let campo = at.campo;
    // Duas rendas de titular na mesma mensagem, com um vínculo citado: a segunda é do segundo proponente.
    if (campo === 'clienteRenda') {
      rendasDoTitular += 1;
      if (rendasDoTitular > 1 && vinculos.length > 0 && !MARCA_CORRECAO.test(normal.slice(0, at.n.inicio))) campo = 'segundoRenda';
    }
    const ini = Math.min(at.inicioAncora, at.n.inicio);
    por(campo, String(at.valor), ini, Math.max(at.n.fim, ini), at.confianca);
    usar(at.n.inicio, at.n.fim);
    ultimoCampoDeDinheiro = { campo, tipo: at.tipo, pos: at.n.inicio };
  }

  // Números que sobraram: correção, resposta à pergunta, ou aviso.
  const sobras = nums.filter((n) => !numeroUsado.has(n) && livre.slice(n.inicio, n.fim).trim() !== '');
  for (const n of sobras) {
    const antes = normal.slice(Math.max(0, n.inicio - 30), n.inicio);
    const correcao = MARCA_CORRECAO.test(antes) || /\be\s*$/.test(antes) && negados.size > 0;
    // "ele ganha 3 mil e ela 2 mil": a sobra depois de "e ela/o marido" é do segundo.
    const eDoSegundo = /\be\s+(?:ela|ele|a esposa|o marido|a mae|o pai|a mulher dele|o esposo)\s*(?:ganha|recebe|com)?\s*(?:de\s+)?$/.test(antes);
    if (eDoSegundo && (campos.has('clienteRenda') || estado.clienteRenda)) {
      const r = emReais(n, 'renda');
      if (r) {
        por('segundoRenda', String(r.valor), n.inicio, n.fim, r.deduzido ? 'media' : 'alta');
        usar(n.inicio, n.fim);
        continue;
      }
    }
    if (correcao && ultimoCampoDeDinheiro) {
      const r = emReais(n, ultimoCampoDeDinheiro.tipo);
      if (r) {
        por(ultimoCampoDeDinheiro.campo, String(r.valor), n.inicio, n.fim, 'media');
        usar(n.inicio, n.fim);
        continue;
      }
    }
    if (pendente && !campos.has(pendente)) {
      const aceitou = responderPendente(pendente, n);
      if (aceitou) {
        por(pendente, aceitou.valor, n.inicio, n.fim, aceitou.confianca);
        usar(n.inicio, n.fim);
        continue;
      }
    }
    if (n.valor >= 10 && !negados.has(n.inicio)) {
      avisos.push(`Não identifiquei a que se refere "${original.slice(n.inicio, n.fim).trim()}". Escreva junto o que é, por exemplo: "renda 3.500" ou "entrada 5 mil".`);
    }
  }

  // --------------------------------------------------------------- 7. nomes
  const nomeDepois = (pos: number): { nome: string; inicio: number; fim: number; certo: boolean } | null => {
    const resto = original.slice(pos);
    const temMaiusculas = /[A-ZÀ-Ý]/.test(original);
    const palavras = [...resto.matchAll(/[A-Za-zÀ-ÿ'][A-Za-zÀ-ÿ'-]*|[,.;:\n\d]/g)];
    const escolhidas: RegExpMatchArray[] = [];
    let pulouArtigo = false;
    for (const w of palavras) {
      const p = w[0];
      const pn = normalizar(p);
      if (/^[,.;:\n\d]$/.test(p)) break;
      if (escolhidas.length === 0 && !pulouArtigo && ['a', 'o', 'e', 'eh', 'é', 'se', 'chama', 'chamada', 'chamado', 'dela', 'dele', 'do', 'da', 'que'].includes(pn)) {
        if (pn === 'se' || pn === 'chama' || pn === 'e' || pn === 'eh' || pn === 'dela' || pn === 'dele' || pn === 'que') continue;
        pulouArtigo = true;
        continue;
      }
      if (escolhidas.length > 0 && CONECTORES_DE_NOME.has(pn)) {
        escolhidas.push(w);
        continue;
      }
      if (FIM_DE_NOME.has(pn) || PALAVRAS_DE_NUMERO.has(pn)) break;
      if (temMaiusculas && !/^[A-ZÀ-Ý]/.test(p)) break;
      escolhidas.push(w);
      if (escolhidas.filter((x) => !CONECTORES_DE_NOME.has(normalizar(x[0]))).length >= 6) break;
    }
    while (escolhidas.length && CONECTORES_DE_NOME.has(normalizar(escolhidas[escolhidas.length - 1]![0]))) escolhidas.pop();
    if (escolhidas.length === 0) return null;
    const primeiro = escolhidas[0]!;
    const ultimo = escolhidas[escolhidas.length - 1]!;
    const inicio = pos + primeiro.index!;
    const fim = pos + ultimo.index! + ultimo[0].length;
    const nome = original.slice(inicio, fim).replace(/\s+/g, ' ').trim();
    if (nome.length < 2) return null;
    return { nome: temMaiusculas ? nome : titulo(nome), inicio, fim, certo: temMaiusculas };
  };

  const gatilhosTitular = /\b(?:nome do cliente|nome da cliente|nome do comprador|nome da compradora|o cliente|a cliente|cliente|comprador|compradora|titular|proponente principal|primeiro proponente|meu nome e|se chama|atendi(?:\s+hoje)?|atendendo|falei com|conversei com)\b\s*(?:e|eh|:|-|se chama|chamad[oa])?\s*/g;
  for (const m of todos(gatilhosTitular, normal)) {
    // "cliente" seguido de verbo ("cliente quer", "cliente ganha") não traz nome.
    const achou = nomeDepois(m.index + m[0].length);
    if (!achou) continue;
    por('clienteNome', achou.nome, achou.inicio, achou.fim, achou.certo ? 'alta' : 'media');
    break;
  }
  for (const v of vinculos) {
    const depois = normal.slice(v.fim, v.fim + 30);
    const m = /^\s*(?:dele|dela|do cliente|da cliente)?\s*[,:]?\s*(?:que\s+)?(?:se chama|chamad[oa]|e|eh|:)?\s*/.exec(depois);
    const achou = nomeDepois(v.fim + (m ? m[0].length : 0));
    if (!achou) continue;
    por('segundoNome', achou.nome, achou.inicio, achou.fim, achou.certo ? 'alta' : 'media');
    break;
  }
  for (const m of todos(/\b(?:segund[oa] proponente|2o proponente)\b\s*(?:e|eh|:|-|se chama|chamad[oa])?\s*/g, normal)) {
    const achou = nomeDepois(m.index + m[0].length);
    if (achou) {
      por('segundoNome', achou.nome, achou.inicio, achou.fim, achou.certo ? 'alta' : 'media');
      break;
    }
  }
  // Sem gatilho, mas com um nome próprio de duas palavras ou mais ("Juliana
  // Ferreira quer o Águas"): é o cliente, desde que não seja cadastro nem o 2º.
  if (!campos.has('clienteNome') && /[A-ZÀ-Ý]/.test(original) && /[a-zà-ÿ]/.test(original)) {
    const reservado = [campos.get('segundoNome')?.valor, ...(entrada.empreendimentos ?? []).map((e) => e.nome), ...(entrada.correspondentes ?? []).map((c) => c.nome)]
      .filter(Boolean)
      .map((n) => normalizar(n!));
    for (const m of original.matchAll(/(?:^|[^A-Za-zÀ-ÿ])([A-ZÀ-Ý][a-zà-ÿ'-]+(?:\s+(?:da|de|do|das|dos|e)?\s*[A-ZÀ-Ý][a-zà-ÿ'-]+){1,4})/g)) {
      const nome = m[1]!.trim();
      const ps = normalizar(nome).split(' ');
      if (ps.some((p) => NAO_E_NOME.has(p))) continue;
      if (reservado.some((r) => r.includes(normalizar(nome)) || normalizar(nome).includes(r))) continue;
      const inicio = m.index! + m[0].indexOf(m[1]!);
      por('clienteNome', nome, inicio, inicio + nome.length, 'media');
      break;
    }
  }

  // Resposta curta à pergunta "qual o nome do cliente?": o texto é só o nome.
  if (pendente === 'clienteNome' && !campos.has('clienteNome')) {
    const so = original.trim();
    if (/^[A-Za-zÀ-ÿ' -]{3,80}$/.test(so) && so.split(/\s+/).length <= 6) por('clienteNome', titulo(so), 0, original.length, 'media');
  }

  // --------------------------------------------------- 8. cadastro: empreendimento
  const empreendimentos = entrada.empreendimentos ?? [];
  if (empreendimentos.length) {
    const r = acharNoTexto(normal, empreendimentos);
    if (r.tipo === 'achado') por('empreendimento', r.item.id, r.inicio, r.fim, r.confianca);
    else if (r.tipo === 'ambiguo') avisos.push(`Pode ser ${r.itens.map((i) => i.nome).join(' ou ')}. Escreva o nome completo do empreendimento.`);
  }
  const correspondentes = entrada.correspondentes ?? [];
  if (correspondentes.length) {
    const r = acharNoTexto(normal, correspondentes);
    const citou = /\b(?:correspondente|correspondencia|corresp|banco|caixa com|com o|com a)\b/.test(normal);
    if (r.tipo === 'achado' && (citou || r.confianca === 'alta')) por('correspondente', r.item.id, r.inicio, r.fim, r.confianca);
    else if (r.tipo === 'ambiguo' && citou) avisos.push(`O correspondente pode ser ${r.itens.map((i) => i.nome).join(' ou ')}. Escreva o nome completo.`);
  }

  // --------------------------------------------------------- 9. sim / não
  const negaSegundo = /\b(?:sem segund[oa] proponente|nao tem segund[oa] proponente|sozinh[oa]|so (?:ele|ela)|nao vai compor|sem compor|nao compoe|sem composicao)\b/;
  const temVinculoEmCompra = vinculos.length > 0 && (SEGUNDO_EXPLICITO.test(normal) || campos.has('segundoRenda') || campos.has('segundoCpf') || campos.has('segundoNome') || /\b(?:com|junto com|e)\s+(?:a|o|sua|seu|minha|meu)?\s*(?:esposa|esposo|marido|companheir[oa]|mae|pai|irma|irmao|noiv[oa])\b/.test(normal));
  if (negaSegundo.test(normal)) {
    const m = negaSegundo.exec(normal)!;
    por('temSegundoProponente', 'nao', m.index, m.index + m[0].length, 'alta');
    for (const c of ['associacao', 'segundoNome', 'segundoRenda', 'segundoCpf']) {
      campos.delete(c);
      remover.add(c);
    }
  } else if (temVinculoEmCompra || SEGUNDO_EXPLICITO.test(normal) || campos.has('segundoRenda') || campos.has('segundoNome')) {
    const m = SEGUNDO_EXPLICITO.exec(normal) ?? (vinculos[0] ? { index: vinculos[0].pos, 0: normal.slice(vinculos[0].pos, vinculos[0].fim) } : null);
    if (m) por('temSegundoProponente', 'sim', m.index, m.index + String(m[0]).length, 'alta');
    const v = vinculos.find((x) => x.tipo === 'conjuge') ?? vinculos[0];
    if (v) por('associacao', v.tipo, v.pos, v.fim, 'alta');
  }

  const taxa = /\btaxa/.exec(normal);
  if (taxa) {
    const f = frase(normal, taxa.index);
    const t = normal.slice(f.inicio, f.fim);
    const nao = /\b(?:construtora|incorporadora|empresa|a gente|nos|imobiliaria|vendedor)\b[^.;]{0,30}\b(?:paga|absorve|banca|assume|arca|cobre)\b|\b(?:isenta|isento|gratis|sem custo|por conta da construtora|cliente nao paga|nao paga|nao vai pagar|nao cobra)\b/.test(t);
    const sim = /\b(?:cliente paga|ele paga|ela paga|fica com (?:ele|ela|o cliente|a cliente)|por conta (?:dele|dela|do cliente|da cliente)|e do cliente|cliente que paga|cliente vai pagar|paga a taxa)\b/.test(t);
    if (nao || sim) por('cefTaxaClientePaga', nao ? 'nao' : 'sim', f.inicio, f.fim, 'alta');
  }

  // ------------------------------------------------------------ 10. remoções
  const REMOVER: [RegExp, string[]][] = [
    [/segund[oa] proponente|2o proponente|composicao|compor renda|esposa|esposo|marido|conjuge/, ['associacao', 'segundoNome', 'segundoRenda', 'segundoCpf']],
    [/fgts|fundo de garantia/, ['fgts']],
    [/subsidio/, ['subsidio']],
    [/semestra/, ['semestraisQuantidade', 'semestralValor']],
    [/anua|anuidade/, ['anuaisQuantidade', 'anualValor']],
    [/e-?mail/, ['clienteEmail']],
    [/telefone|celular|whats/, ['clienteTelefone']],
    [/parcela da caixa|parcela cef|parcela do banco/, ['cefParcela']],
    [/entrada|ato|sinal/, ['ato', 'atoDataVencimento']],
    [/correspondente/, ['correspondente']],
  ];
  for (const m of todos(/\b(?:esquece|esqueca|remove|remova|remover|tira|tire|tirar|apaga|apague|desconsidera|desconsidere|cancela|cancele|retira|retire|sem|nao tem|nao tera|nao vai ter|nao vai usar|nao usa|nao vai|zera|zerar)\s+(?:mais\s+)?(?:o|a|os|as|de|do|da|com|usar)?\s*([a-z0-9 -]{2,30})/, normal)) {
    const alvo = m[1]!;
    for (const [re, chaves] of REMOVER) {
      if (!re.test(alvo.slice(0, 28))) continue;
      // "sem entrada" só remove se nenhum valor de entrada veio nesta mensagem.
      if (chaves.includes('ato') && campos.has('ato')) continue;
      for (const c of chaves) {
        if (campos.get(c)?.trecho && !/esquece|remove|tira|apaga|desconsidera|cancela|retira|zera/.test(m[0])) {
          // "sem FGTS" junto de um valor de FGTS é contradição: fica o valor.
          if (campos.has(c)) continue;
        }
        campos.delete(c);
        remover.add(c);
      }
      if (chaves.includes('segundoRenda')) por('temSegundoProponente', 'nao', m.index, m.index + m[0].length, 'alta');
      break;
    }
  }

  // ----------------------------------- a carteira: o cliente que já está cadastrado
  const clientes = entrada.clientes ?? [];
  if (clientes.length) {
    let lead: ClienteDoCadastro | null = null;
    const nomeDito = campos.get('clienteNome')?.valor;
    if (nomeDito) {
      const r = acharNoTexto(normalizarMesmoTamanho(nomeDito), clientes);
      if (r.tipo === 'achado' && r.confianca === 'alta') lead = r.item;
      // Só o primeiro nome ("cliente Maria"): vale se a carteira tiver uma Maria só.
      else if (nomeDito.trim().split(/\s+/).length === 1) lead = acharPorPrimeiroNome(normalizarMesmoTamanho(nomeDito), clientes);
    } else {
      // Sem "cliente é...": um nome completo (duas palavras ou mais) da carteira escrito no texto.
      const achados = clientes.filter((c) => {
        const ps = normalizar(c.nome).split(' ').filter((p) => p.length > 2 && !CONECTORES_DE_NOME.has(p));
        return ps.length >= 2 && ps.every((p) => new RegExp(`\\b${p}\\b`).test(normal));
      });
      if (achados.length === 1) lead = achados[0]!;
    }
    if (lead) {
      const prova = 'do cadastro do cliente';
      if (!campos.has('clienteNome') || campos.get('clienteNome')!.valor !== lead.nome) {
        const pos = normal.indexOf(normalizar(lead.nome).split(' ')[0]!);
        por('clienteNome', lead.nome, Math.max(0, pos), Math.max(0, pos) + lead.nome.length, 'alta');
      }
      const faltaNoEstado = (c: string) => !campos.has(c) && !estado[c];
      const cpf = (lead.cpf ?? '').replace(/\D/g, '');
      if (cpf.length === 11 && faltaNoEstado('clienteCpf')) por('clienteCpf', cpf, 0, 0, cpfValido(cpf) ? 'media' : 'baixa', prova);
      const fone = (lead.telefone ?? '').replace(/\D/g, '');
      if (fone.length >= 10 && faltaNoEstado('clienteTelefone')) por('clienteTelefone', fone, 0, 0, 'media', prova);
      if (lead.email?.includes('@') && faltaNoEstado('clienteEmail')) por('clienteEmail', lead.email, 0, 0, 'media', prova);
      if (lead.renda && lead.renda > 0 && faltaNoEstado('clienteRenda')) por('clienteRenda', String(lead.renda), 0, 0, 'media', prova);
    }
  }

  // Não repete o que já está no estado com o MESMO valor (é ruído na tela).
  const saida = [...campos.values()].filter((c) => estado[c.chave] !== c.valor);
  return {
    campos: saida,
    remover: [...remover],
    observacao: avisos.length ? [...new Set(avisos)].join(' ') : null,
  };
}

/** Resposta curta à pergunta da LIA: "3.500" quando ela pediu a renda. */
function responderPendente(chave: string, n: NumeroNoTexto): { valor: string; confianca: Confianca } | null {
  const tipos: Record<string, TipoDeValor> = {
    valorUnidade: 'imovel',
    financiamentoAprovado: 'imovel',
    clienteRenda: 'renda',
    segundoRenda: 'renda',
    ato: 'entrada',
    subsidio: 'entrada',
    fgts: 'entrada',
    semestralValor: 'entrada',
    anualValor: 'entrada',
    cefParcela: 'parcela',
  };
  if (tipos[chave]) {
    const r = emReais(n, tipos[chave]!);
    return r ? { valor: String(r.valor), confianca: 'media' } : null;
  }
  const q = inteiroDe(n);
  if (q === null) return null;
  const faixas: Record<string, [number, number]> = {
    bloco: [0, 100],
    mensaisQuantidade: [1, 420],
    mensalDiaVencimento: [1, 31],
    semestraisQuantidade: [1, 60],
    anuaisQuantidade: [1, 30],
    unidade: [1, 99999],
  };
  const f = faixas[chave];
  if (!f || q < f[0] || q > f[1]) return null;
  return { valor: chave === 'unidade' ? (n.digitos ?? String(q)) : String(q), confianca: 'media' };
}
