/**
 * OS NÚMEROS DO JEITO QUE O CORRETOR ESCREVE.
 *
 * Numa negociação, ninguém digita "R$ 210.000,00". Digita-se "210 mil",
 * "210", "duzentos e dez", "2.800", "dois e oitocentos", "3,5", "três e meio",
 * "um salário". Este arquivo acha cada um desses números no texto e devolve o
 * valor com as pistas de ESCALA que vieram junto — é a escala que separa
 * "renda três e meio" (R$ 3.500) de "três apartamentos".
 *
 * O que fazer com a escala depende do campo (preço de imóvel "210" é 210 mil;
 * parcela da Caixa "850" é 850 reais), então a decisão final fica em
 * `emReais`, que recebe o tipo de valor.
 */

export interface NumeroNoTexto {
  valor: number;
  inicio: number;
  fim: number;
  /** Veio com "mil", "milhão" ou "k": o valor já está em reais. */
  escalaExplicita: boolean;
  /** "dois e oitocentos", "três e meio": a fala abreviada de milhar. */
  coloquial: boolean;
  /** Veio com "R$" ou "reais": não é quantidade, é dinheiro. */
  moeda: boolean;
  /** Os dígitos crus, quando o número foi escrito só com dígitos. */
  digitos: string | null;
  /** Escrito por extenso (ao menos em parte). */
  extenso: boolean;
}

const UNIDADES: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7,
  oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14,
  quinze: 15, dezesseis: 16, dezasseis: 16, dezessete: 17, dezoito: 18, dezenove: 19,
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, cincoenta: 50, sessenta: 60,
  setenta: 70, oitenta: 80, noventa: 90,
  cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300,
  quatrocentos: 400, quatrocentas: 400, quinhentos: 500, quinhentas: 500,
  seiscentos: 600, seiscentas: 600, setecentos: 700, setecentas: 700,
  oitocentos: 800, oitocentas: 800, novecentos: 900, novecentas: 900,
};

const ESCALAS: Record<string, number> = {
  mil: 1000, k: 1000, milhao: 1_000_000, milhoes: 1_000_000, mi: 1_000_000, mm: 1_000_000,
};

/** "um"/"uma" sozinhos são artigo ("um apartamento"), não número. */
const SO_COM_COMPANHIA = new Set(['um', 'uma']);

/** O salário mínimo usado em "um salário", "dois salários e meio". */
export const SALARIO_MINIMO = 1518;

interface Token {
  t: string;
  inicio: number;
  fim: number;
}

function tokens(normal: string): Token[] {
  const out: Token[] = [];
  const re = /r\$|\d[\d.,]*|[a-z]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(normal))) {
    let t = m[0];
    let fim = m.index + t.length;
    // "3." e "3," no fim da frase: a pontuação não é do número.
    while (/\d[.,]$/.test(t)) {
      t = t.slice(0, -1);
      fim -= 1;
    }
    out.push({ t, inicio: m.index, fim });
  }
  return out;
}

/** "210.000,00" → 210000; "2.800" → 2800; "3,5" → 3.5; "1518.50" → 1518.5. */
export function lerDigitos(t: string): number | null {
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) return Number(t.replace(/\./g, '').replace(',', '.'));
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(t)) return Number(t.replace(/,/g, ''));
  if (/^\d+,\d+$/.test(t)) return Number(t.replace(',', '.'));
  if (/^\d+\.\d{1,2}$/.test(t)) return Number(t);
  if (/^\d+$/.test(t)) return Number(t);
  return null;
}

type Item = { tipo: 'num'; v: number } | { tipo: 'escala'; v: number } | { tipo: 'meio' };

function compor(itens: Item[]): { valor: number; coloquial: boolean; escala: boolean } {
  const temEscala = itens.some((i) => i.tipo === 'escala');
  const nums = itens.filter((i): i is { tipo: 'num'; v: number } => i.tipo === 'num').map((i) => i.v);
  const temMeio = itens.some((i) => i.tipo === 'meio');

  if (!temEscala) {
    // "três e meio" = 3,5 (de milhar, decidido pelo campo).
    if (temMeio && nums.length === 1) return { valor: nums[0]! + 0.5, coloquial: true, escala: false };
    // "dois e oitocentos (e cinquenta)": parte de 1 a 99, depois centenas.
    const idx = nums.findIndex((v) => v >= 100);
    if (idx > 0) {
      const a = nums.slice(0, idx).reduce((s, v) => s + v, 0);
      const b = nums.slice(idx).reduce((s, v) => s + v, 0);
      if (a >= 1 && a <= 99 && b >= 100 && b <= 999) {
        return { valor: a * 1000 + b, coloquial: true, escala: false };
      }
    }
  }

  let total = 0;
  let atual = 0;
  for (const i of itens) {
    if (i.tipo === 'num') atual += i.v;
    else if (i.tipo === 'meio') atual += 0.5;
    else {
      total += (atual || 1) * i.v;
      atual = 0;
    }
  }
  // "dois salários e meio": o meio depois da escala vale meia escala.
  return { valor: total + atual, coloquial: false, escala: temEscala };
}

/**
 * Todos os números do texto normalizado, com posição e pistas de escala.
 * Percentuais ("4%") ficam de fora: não são dinheiro nem quantidade aqui.
 */
export function acharNumeros(normal: string): NumeroNoTexto[] {
  const tk = tokens(normal);
  const achados: NumeroNoTexto[] = [];
  let i = 0;
  while (i < tk.length) {
    const primeiro = tk[i]!;
    let moeda = false;
    let j = i;
    if (primeiro.t === 'r$') {
      moeda = true;
      j += 1;
    }
    const inicioTk = tk[j];
    if (!inicioTk || !comecaNumero(tk, j)) {
      i += 1;
      continue;
    }

    const itens: Item[] = [];
    let extenso = false;
    let soDigitos = true;
    let digitos: string | null = null;
    let k = j;
    let ultimoFim = inicioTk.fim;
    while (k < tk.length) {
      const t = tk[k]!;
      // Palavras precisam estar coladas (só espaço entre elas).
      if (k > j && normal.slice(tk[k - 1]!.fim, t.inicio).trim() !== '') break;
      if (/^\d/.test(t.t)) {
        const v = lerDigitos(t.t);
        if (v === null) break;
        // Dígito depois de dígito sem "e" no meio: são dois números.
        if (itens.length && itens[itens.length - 1]!.tipo === 'num' && tk[k - 1]!.t !== 'e') break;
        itens.push({ tipo: 'num', v });
        if (/^\d+$/.test(t.t) && itens.length === 1) digitos = t.t;
        ultimoFim = t.fim;
        k += 1;
        continue;
      }
      if (t.t in UNIDADES && (!SO_COM_COMPANHIA.has(t.t) || acompanhado(tk, k))) {
        itens.push({ tipo: 'num', v: UNIDADES[t.t]! });
        extenso = true;
        soDigitos = false;
        ultimoFim = t.fim;
        k += 1;
        continue;
      }
      // "mil e quinhentos": o "mil" sozinho abre o número (vale 1 mil).
      if (t.t === 'mil' && itens.length === 0) {
        itens.push({ tipo: 'num', v: 1 }, { tipo: 'escala', v: 1000 });
        extenso = true;
        soDigitos = false;
        ultimoFim = t.fim;
        k += 1;
        continue;
      }
      if (t.t in ESCALAS && itens.length > 0) {
        // "k" só colado no número ("210k"); "mi" só depois de número.
        if (t.t === 'k' && t.inicio !== tk[k - 1]!.fim) break;
        itens.push({ tipo: 'escala', v: ESCALAS[t.t]! });
        soDigitos = false;
        ultimoFim = t.fim;
        k += 1;
        continue;
      }
      if (t.t === 'e' && itens.length > 0) {
        const prox = tk[k + 1];
        if (!prox) break;
        if (prox.t === 'meio' || prox.t === 'meia') {
          itens.push({ tipo: 'meio' });
          soDigitos = false;
          ultimoFim = prox.fim;
          k += 2;
          continue;
        }
        const ultimo = itens[itens.length - 1]!;
        const proxV = /^\d/.test(prox.t) ? lerDigitos(prox.t) : (UNIDADES[prox.t] ?? null);
        if (proxV === null) break;
        // Com dígitos, o "e" só junta "2 e 800" (milhar abreviado) ou depois
        // de "mil" ("2 mil e 800"). "bloco 2 e 3" são dois números.
        void ultimo;
        if (/^\d/.test(prox.t) && !(proxV >= 100 && proxV <= 999)) break;
        k += 1; // consome o "e"; o próximo laço lê o número
        continue;
      }
      break;
    }
    if (itens.length === 0 || itens.every((it) => it.tipo !== 'num')) {
      i += 1;
      continue;
    }
    // Percentual: não é número que interesse.
    if (normal[ultimoFim] === '%' || /^\s*(%|por ?cento)/.test(normal.slice(ultimoFim, ultimoFim + 10))) {
      i = k;
      continue;
    }
    const { valor, coloquial, escala } = compor(itens);
    let fim = ultimoFim;
    const depois = normal.slice(fim, fim + 7);
    if (/^\s*reais\b/.test(depois)) {
      moeda = true;
      fim += depois.indexOf('reais') + 5;
    }
    achados.push({
      valor,
      inicio: moeda && primeiro.t === 'r$' ? primeiro.inicio : inicioTk.inicio,
      fim,
      escalaExplicita: escala,
      coloquial,
      moeda,
      digitos: soDigitos && itens.length === 1 ? digitos : null,
      extenso,
    });
    i = k;
  }
  return achados;
}

function comecaNumero(tk: Token[], j: number): boolean {
  const t = tk[j]!.t;
  if (/^\d/.test(t)) return lerDigitos(t) !== null;
  if (t in UNIDADES) return !SO_COM_COMPANHIA.has(t) || acompanhado(tk, j);
  return t === 'mil';
}

/** "um mil", "um milhão", "vinte e um": o "um" é número. */
function acompanhado(tk: Token[], j: number): boolean {
  const prox = tk[j + 1]?.t;
  const ant = tk[j - 1]?.t;
  const antAnt = tk[j - 2]?.t;
  if (prox && prox in ESCALAS) return true;
  if (prox === 'e' && (tk[j + 2]?.t === 'meio' || tk[j + 2]?.t === 'meia')) return true;
  return ant === 'e' && !!antAnt && antAnt in UNIDADES;
}

/** O tipo de valor, para decidir a escala. */
export type TipoDeValor =
  | 'imovel' // preço da unidade, financiamento aprovado
  | 'entrada' // ato, FGTS, subsídio, reforços
  | 'renda'
  | 'parcela'; // parcela da Caixa

/**
 * O número em reais, pelo tipo de valor. Devolve `null` quando o número não
 * faz sentido para aquele tipo (ex.: preço de imóvel de R$ 3).
 */
export function emReais(n: NumeroNoTexto, tipo: TipoDeValor): { valor: number; deduzido: boolean } | null {
  let v = n.valor;
  let deduzido = false;
  if (!n.escalaExplicita) {
    const limite = tipo === 'imovel' ? 1000 : tipo === 'parcela' ? 10 : 100;
    if (n.coloquial && v < 1000) {
      v *= 1000;
      deduzido = true;
    } else if (v < limite && !(n.moeda && v >= 100)) {
      v *= 1000;
      deduzido = true;
    }
  }
  v = Math.round(v * 100) / 100;
  const faixa: Record<TipoDeValor, [number, number]> = {
    imovel: [10_000, 50_000_000],
    entrada: [50, 10_000_000],
    renda: [300, 1_000_000],
    parcela: [50, 100_000],
  };
  const [min, max] = faixa[tipo];
  if (v < min || v > max) return null;
  return { valor: v, deduzido };
}

/** Quantidade inteira (bloco, parcelas, dia): sem escala. */
export function inteiroDe(n: NumeroNoTexto): number | null {
  if (n.escalaExplicita || n.coloquial) return null;
  return Number.isInteger(n.valor) ? n.valor : null;
}
