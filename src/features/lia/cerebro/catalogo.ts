/**
 * ACHAR NO TEXTO UM NOME DO CADASTRO — sem ninguém dizer "o empreendimento é".
 *
 * O corretor escreve "cliente quer o estrelas, bloco 3". O cérebro precisa
 * perceber que "estrelas" é o Village das Estrelas. O problema é que, num
 * catálogo real, os nomes se repetem: Village das Estrelas, Village das Águas
 * II, Village Connect I, Village Reserva II. "Village" não diz nada; "estrelas"
 * diz tudo.
 *
 * Então cada palavra do nome vale pelo quanto ela é RARA no catálogo (uma
 * palavra que só um empreendimento tem vale 1; uma que quatro têm vale ¼). O
 * nome que junta mais peso no texto ganha — e só ganha se ganhar com folga.
 * Empate não escolhe: vira pergunta, como sempre foi na LIA.
 *
 * Numerais ("II", "2") só contam colados a outra palavra do nome ("reserva
 * 2"): o texto de uma negociação está cheio de "2" que são bloco, parcela ou
 * quarto.
 */
import { normalizar } from './texto';

export interface ItemDoCatalogo {
  id: string;
  nome: string;
}

export type AchadoNoCatalogo<T extends ItemDoCatalogo> =
  | { tipo: 'achado'; item: T; confianca: 'alta' | 'media'; inicio: number; fim: number }
  | { tipo: 'ambiguo'; itens: T[] }
  | { tipo: 'nada' };

const ROMANOS: Record<string, string> = { i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10' };

/** Palavras que aparecem em nome de empreendimento mas não identificam nenhum. */
const GENERICAS = new Set([
  'residencial', 'condominio', 'edificio', 'loteamento', 'conjunto', 'modulo', 'mod', 'etapa',
  'fase', 'torre', 'de', 'da', 'do', 'das', 'dos', 'e', 'o', 'a', 'the', 'em', 'no', 'na',
]);

function palavrasDoNome(nome: string): string[] {
  return normalizar(nome)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => ROMANOS[p] ?? p)
    .filter((p) => !GENERICAS.has(p));
}

function distancia(a: string, b: string): number {
  if (a === b) return 0;
  const linha = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let anterior = linha[0]!;
    linha[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const guardado = linha[j]!;
      linha[j] = Math.min(linha[j]! + 1, linha[j - 1]! + 1, anterior + (a[i - 1] === b[j - 1] ? 0 : 1));
      anterior = guardado;
    }
  }
  return linha[b.length]!;
}

interface PalavraDoTexto {
  p: string;
  inicio: number;
  fim: number;
}

function palavrasDoTexto(normal: string): PalavraDoTexto[] {
  const out: PalavraDoTexto[] = [];
  const re = /[a-z0-9]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(normal))) out.push({ p: ROMANOS[m[0]] ?? m[0], inicio: m.index, fim: m.index + m[0].length });
  return out;
}

const eNumeral = (p: string) => /^\d+$/.test(p);

function casa(dita: string, doNome: string): boolean {
  if (dita === doNome) return true;
  if (eNumeral(doNome) || eNumeral(dita)) return false;
  if (doNome.length < 4 || dita.length < 4) return false;
  return distancia(dita, doNome) <= Math.floor(doNome.length / 4);
}

/**
 * O item do catálogo citado no texto (normalizado, mesmo tamanho do original).
 * `exigirForte`: pede ao menos uma palavra exclusiva do item — para não achar
 * empreendimento em qualquer frase que diga "parque" ou "vila".
 */
export function acharNoTexto<T extends ItemDoCatalogo>(normal: string, itens: T[]): AchadoNoCatalogo<T> {
  if (itens.length === 0) return { tipo: 'nada' };
  const nomes = itens.map((i) => [...new Set(palavrasDoNome(i.nome))]);
  const df = new Map<string, number>();
  for (const ps of nomes) for (const p of new Set(ps)) df.set(p, (df.get(p) ?? 0) + 1);
  const texto = palavrasDoTexto(normal);
  // O numeral só pesa quando é ele que separa dois nomes ("Reserva I" e
  // "Reserva II"); sem irmão, "Connect I" se acha só por "connect".
  const base = nomes.map((ps) => ps.filter((p) => !eNumeral(p)).join(' '));
  const temIrmao = base.map((b, i) => base.some((o, j) => j !== i && o === b));

  const pontos = itens.map((item, idx) => {
    const ps = nomes[idx]!;
    if (ps.length === 0) return { item, score: 0, forte: false, distintiva: false, inicio: -1, fim: -1 };
    let peso = 0;
    let achado = 0;
    let forte = false;
    let inicio = Infinity;
    let fim = -1;
    const pesos = ps.filter((p) => !eNumeral(p)).map((p) => 1 / (df.get(p) ?? 1));
    const maiorPeso = pesos.length ? Math.max(...pesos) : 0;
    let distintiva = false;
    ps.forEach((p, k) => {
      const w = 1 / (df.get(p) ?? 1);
      if (eNumeral(p) && !temIrmao[idx]) return;
      peso += w;
      let pos: PalavraDoTexto | undefined;
      if (eNumeral(p)) {
        // Numeral só vale colado à palavra anterior do nome ("reserva 2").
        const anterior = ps[k - 1];
        if (anterior) {
          const i = texto.findIndex((t, j) => t.p === p && j > 0 && casa(texto[j - 1]!.p, anterior));
          pos = i >= 0 ? texto[i] : undefined;
        }
      } else {
        pos = texto.find((t) => casa(t.p, p));
      }
      if (pos) {
        achado += w;
        if (w === 1 && !eNumeral(p)) forte = true;
        // O numeral que separa irmãos ("reserva 2") decide sozinho.
        if (eNumeral(p) && temIrmao[idx]) forte = true;
        if (!eNumeral(p) && w === maiorPeso) distintiva = true;
        inicio = Math.min(inicio, pos.inicio);
        fim = Math.max(fim, pos.fim);
      }
    });
    return { item, score: peso ? achado / peso : 0, forte, distintiva, inicio, fim };
  });

  const candidatos = pontos.filter((p) => p.score >= 0.5 && (p.forte || p.score === 1)).sort((a, b) => b.score - a.score);
  if (candidatos.length === 0) {
    // Ninguém claro, mas a palavra mais característica de dois ou mais nomes
    // apareceu ("reserva" com Reserva I e Reserva II): pergunta.
    const parecidos = pontos.filter((p) => p.distintiva);
    return parecidos.length > 1 ? { tipo: 'ambiguo', itens: parecidos.map((p) => p.item) } : { tipo: 'nada' };
  }
  const [primeiro, segundo] = candidatos;
  if (segundo && primeiro!.score - segundo.score < 0.2) {
    return { tipo: 'ambiguo', itens: candidatos.filter((c) => primeiro!.score - c.score < 0.2).map((c) => c.item) };
  }
  return {
    tipo: 'achado',
    item: primeiro!.item,
    confianca: primeiro!.score >= 0.99 ? 'alta' : 'media',
    inicio: primeiro!.inicio,
    fim: primeiro!.fim,
  };
}

/**
 * Pessoa citada só pelo primeiro nome ("ligar pro João"): casa quando UM só
 * cliente da carteira tem esse primeiro nome. Dois Joãos = não escolhe.
 */
export function acharPorPrimeiroNome<T extends ItemDoCatalogo>(normal: string, itens: T[]): T | null {
  const texto = new Set(palavrasDoTexto(normal).map((p) => p.p));
  const achados = itens.filter((i) => {
    const primeiro = normalizar(i.nome).split(' ')[0] ?? '';
    return primeiro.length >= 3 && texto.has(primeiro);
  });
  return achados.length === 1 ? achados[0]! : null;
}
