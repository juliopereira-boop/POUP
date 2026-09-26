/**
 * DATAS E HORÁRIOS DO JEITO QUE SE FALA.
 *
 * "amanhã", "sexta", "sexta que vem", "dia 10", "10 de março", "10/03",
 * "daqui a 3 dias", "às 10", "10h30", "3 da tarde", "meio-dia".
 *
 * Tudo resolvido contra HOJE (a data local do aparelho, em AAAA-MM-DD), e
 * sempre pelas partes locais, sem `toISOString()`: à noite no Brasil o UTC já
 * é o dia seguinte, e "amanhã" viraria depois de amanhã.
 *
 * A regra de ouro é a mesma da LIA de antes: NUNCA chutar. Um dia que não
 * existe (31/02) ou uma hora impossível (25h) não vira data nenhuma.
 */

export interface DataNoTexto {
  iso: string;
  inicio: number;
  fim: number;
}

export interface HoraNoTexto {
  hhmm: string;
  inicio: number;
  fim: number;
}

const MESES: Record<string, number> = {
  janeiro: 1, jan: 1, fevereiro: 2, fev: 2, marco: 3, mar: 3, abril: 4, abr: 4, maio: 5, mai: 5,
  junho: 6, jun: 6, julho: 7, jul: 7, agosto: 8, ago: 8, setembro: 9, set: 9, outubro: 10,
  out: 10, novembro: 11, nov: 11, dezembro: 12, dez: 12,
};

const SEMANA: Record<string, number> = {
  domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6,
};

const HORAS_EXTENSO: Record<string, number> = {
  uma: 1, um: 1, duas: 2, dois: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8,
  nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15,
  dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20,
};

interface Dia {
  a: number;
  m: number;
  d: number;
}

function deIso(iso: string): Dia {
  const [a, m, d] = iso.split('-').map(Number);
  return { a: a!, m: m!, d: d! };
}

function paraIso({ a, m, d }: Dia): string {
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function diasNoMes(a: number, m: number): number {
  return new Date(a, m, 0).getDate();
}

function valido(a: number, m: number, d: number): boolean {
  return m >= 1 && m <= 12 && d >= 1 && d <= diasNoMes(a, m);
}

function somarDias(dia: Dia, n: number): Dia {
  const dt = new Date(dia.a, dia.m - 1, dia.d + n);
  return { a: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
}

function diaDaSemana(dia: Dia): number {
  return new Date(dia.a, dia.m - 1, dia.d).getDay();
}

/** Hoje, pelas partes locais do aparelho. */
export function hojeLocal(agora = new Date()): string {
  return paraIso({ a: agora.getFullYear(), m: agora.getMonth() + 1, d: agora.getDate() });
}

/** "dia 10": deste mês se ainda não passou, do próximo se já passou. */
function proximoDia(hoje: Dia, d: number): Dia | null {
  if (d < 1 || d > 31) return null;
  let { a, m } = hoje;
  if (d < hoje.d) {
    m += 1;
    if (m > 12) {
      m = 1;
      a += 1;
    }
  }
  // "dia 31" num mês de 30: vai ao próximo mês que tem o dia.
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    if (valido(a, m, d)) return { a, m, d };
    m += 1;
    if (m > 12) {
      m = 1;
      a += 1;
    }
  }
  return null;
}

/** "10 de março": deste ano, ou do próximo se já passou. */
function proximaData(hoje: Dia, d: number, m: number, a?: number): Dia | null {
  if (a !== undefined) {
    const ano = a < 100 ? 2000 + a : a;
    return valido(ano, m, d) ? { a: ano, m, d } : null;
  }
  let ano = hoje.a;
  if (m < hoje.m || (m === hoje.m && d < hoje.d)) ano += 1;
  return valido(ano, m, d) ? { a: ano, m, d } : null;
}

/**
 * Todas as datas do texto normalizado, na ordem em que aparecem.
 * `hoje` em AAAA-MM-DD.
 */
export function acharDatas(normal: string, hojeIso: string): DataNoTexto[] {
  const hoje = deIso(hojeIso);
  const achadas: DataNoTexto[] = [];
  const ocupado: [number, number][] = [];
  const livre = (i: number, f: number) => !ocupado.some(([a, b]) => i < b && f > a);
  const guardar = (dia: Dia | null, i: number, f: number) => {
    if (!dia || !livre(i, f)) return;
    ocupado.push([i, f]);
    achadas.push({ iso: paraIso(dia), inicio: i, fim: f });
  };
  const cada = (re: RegExp, fn: (m: RegExpExecArray) => Dia | null) => {
    let m: RegExpExecArray | null;
    while ((m = re.exec(normal))) guardar(fn(m), m.index, m.index + m[0].length);
  };

  // AAAA-MM-DD
  cada(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g, (m) => {
    const a = Number(m[1]), mm = Number(m[2]), d = Number(m[3]);
    return valido(a, mm, d) ? { a, m: mm, d } : null;
  });
  // 10/03, 10/03/2027, 10/03/27, 10-03
  cada(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/g, (m) =>
    proximaData(hoje, Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : undefined),
  );
  // (dia) 10 de março (de 2027)
  cada(
    /\b(?:dia\s+)?(\d{1,2})\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\b(?:\s+de\s+(\d{4}))?/g,
    (m) => proximaData(hoje, Number(m[1]), MESES[m[2]!]!, m[3] ? Number(m[3]) : undefined),
  );
  cada(/\bdepois de amanha\b/g, () => somarDias(hoje, 2));
  cada(/\bamanha\b/g, () => somarDias(hoje, 1));
  cada(/\bhoje\b/g, () => hoje);
  cada(/\b(?:daqui a|daqui|em)\s+(\d{1,2})\s+dias?\b/g, (m) => somarDias(hoje, Number(m[1])));
  cada(/\b(?:semana que vem|proxima semana)\b(?!\s*(?:na|no)?\s*(?:segunda|terca|quarta|quinta|sexta|sabado|domingo))/g, () => somarDias(hoje, 7));
  // sexta, sexta-feira, sexta que vem, próxima sexta, sexta da semana que vem
  cada(
    /\b(?:(proxim[oa])\s+)?(segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:[\s-]*feira)?(\s+(?:que vem|da semana que vem|da outra semana))?\b/g,
    (m) => {
      const alvo = SEMANA[m[2]!]!;
      let delta = (alvo - diaDaSemana(hoje) + 7) % 7;
      if (delta === 0) delta = 7; // "sexta" dita numa sexta: a próxima
      if (m[3] && /semana/.test(m[3]) && delta < 7) delta += 7;
      return somarDias(hoje, delta);
    },
  );
  // dia 10 (sem mês): o próximo dia 10
  cada(/\bdia\s+(\d{1,2})\b(?!\s*(?:[/-]|de\s+[a-z]))/g, (m) => proximoDia(hoje, Number(m[1])));

  return achadas.sort((x, y) => x.inicio - y.inicio);
}

/**
 * Todos os horários do texto normalizado. Aceita "às 10", "10h", "10h30",
 * "10:30", "10 horas", "às dez", "3 da tarde", "meio-dia".
 */
export function acharHoras(normal: string): HoraNoTexto[] {
  const achadas: HoraNoTexto[] = [];
  const ocupado: [number, number][] = [];
  const guardar = (h: number, min: number, i: number, f: number, periodo?: string) => {
    if (ocupado.some(([a, b]) => i < b && f > a)) return;
    let hora = h;
    if (periodo && /tarde|noite/.test(periodo) && hora < 12) hora += 12;
    if (periodo && /madrugada/.test(periodo) && hora === 12) hora = 0;
    if (hora > 23 || min > 59) return;
    ocupado.push([i, f]);
    achadas.push({ hhmm: `${String(hora).padStart(2, '0')}:${String(min).padStart(2, '0')}`, inicio: i, fim: f });
  };
  const PERIODO = '(?:\\s+(?:da|de|a)\\s+(manha|tarde|noite|madrugada))?';
  let m: RegExpExecArray | null;

  const re1 = new RegExp(`\\b(\\d{1,2})\\s*(?::|h)\\s*(\\d{2})\\b${PERIODO}`, 'g');
  while ((m = re1.exec(normal))) guardar(Number(m[1]), Number(m[2]), m.index, m.index + m[0].length, m[3]);

  const re2 = new RegExp(`\\b(\\d{1,2})\\s*(?:h|hs|hr|hrs|horas?)\\b${PERIODO}`, 'g');
  while ((m = re2.exec(normal))) guardar(Number(m[1]), 0, m.index, m.index + m[0].length, m[2]);

  const re3 = new RegExp(`\\b(?:as|a partir das|por volta das|la pelas|pelas)\\s+(\\d{1,2})\\b(?!\\s*(?:[/-]|de\\s+[a-z]|dias?|mil|vezes|reais))${PERIODO}`, 'g');
  while ((m = re3.exec(normal))) guardar(Number(m[1]), 0, m.index, m.index + m[0].length, m[2]);

  const extenso = Object.keys(HORAS_EXTENSO).join('|');
  const re4 = new RegExp(`\\b(?:as|a|pelas)\\s+(${extenso})(?:\\s+e\\s+(meia|quinze|trinta))?(?:\\s+horas?)?\\b${PERIODO}`, 'g');
  while ((m = re4.exec(normal))) {
    const min = m[2] === 'meia' || m[2] === 'trinta' ? 30 : m[2] === 'quinze' ? 15 : 0;
    guardar(HORAS_EXTENSO[m[1]!]!, min, m.index, m.index + m[0].length, m[3]);
  }

  const re5 = /\bmeio[\s-]dia(?:\s+e\s+meia)?\b/g;
  while ((m = re5.exec(normal))) guardar(12, /meia$/.test(m[0]) ? 30 : 0, m.index, m.index + m[0].length);
  const re6 = /\bmeia[\s-]noite\b/g;
  while ((m = re6.exec(normal))) guardar(0, 0, m.index, m.index + m[0].length);

  return achadas.sort((x, y) => x.inicio - y.inicio);
}
