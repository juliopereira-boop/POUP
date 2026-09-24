/**
 * O MODELO POUP DE TABELA DE PREÇO — UM FORMATO SÓ, PARA TODA CONSTRUTORA.
 *
 * ===========================================================================
 * POR QUE UM MODELO
 * ===========================================================================
 * Cada construtora manda a tabela de um jeito: a Canopus manda uma regra
 * (andar × ventilação × vaga) e uma lista de vagas; outras mandam o "espelho",
 * com um preço por apartamento. Ensinar o aplicativo a ler cada PDF novo é
 * uma adaptação a cada construtora. Em vez disso, a tabela é passada para
 * ESTE modelo — um arquivo de planilha (CSV) — e o aplicativo só precisa saber
 * ler um formato.
 *
 * O modelo tem tudo o que o preço precisa, e nada além:
 *
 *   MODELO POUP;TABELA DE PREÇO;VERSÃO 1
 *   EMPREENDIMENTO;Village Connect I
 *   REFERÊNCIA;Setembro
 *   VAGA DE QUEM ESTÁ NA LISTA;MOTO
 *   VAGA DAS DEMAIS UNIDADES;CARRO
 *
 *   [PREÇO POR REGRA]
 *   ANDAR;POSIÇÃO;VAGA;ÁREA M²;AVALIAÇÃO;VENDA
 *   TÉRREO;MAIS VENTILADO;MOTO;40,94;231900,00;244780,00
 *
 *   [LISTA DE VAGAS]
 *   BLOCO;UNIDADE
 *   02;301
 *
 *   [PREÇO POR UNIDADE]
 *   BLOCO;UNIDADE;VAGA;ÁREA M²;AVALIAÇÃO;VENDA
 *   05;104;CARRO;40,94;236900,00;256280,00
 *
 * Toda seção é opcional: tabela só por regra, só por unidade, ou as duas (o
 * preço da unidade vence a regra). Linha começando com # é comentário.
 *
 * ===========================================================================
 * FEITO PARA SOBREVIVER AO EXCEL
 * ===========================================================================
 * O corretor vai abrir isto no Excel, e o Excel mexe no arquivo:
 *
 *   * separador ";" (o do Excel em português), mas "," e tabulação também
 *     são aceitos na leitura;
 *   * UTF-8 com BOM, para os acentos abrirem certos;
 *   * "001" vira "1" quando o Excel salva — e não faz diferença, porque a
 *     unidade casa pelo número (`chaves.ts`);
 *   * valores em qualquer escrita: "244780,00", "244.780,00", "R$ 244.780,00",
 *     "244780.00".
 *
 * A leitura nunca descarta nada em silêncio: linha que não deu para entender
 * vira aviso com o número da linha.
 */
import { chaveDaUnidadeNoBloco, normalizar } from './chaves';
import {
  descreverRegra,
  type ListaDeVagas,
  type PrecoDeUnidade,
  type RegraDePreco,
  type TabelaDePreco,
  type Vaga,
  type Ventilacao,
} from './preco';

export const VERSAO_DO_MODELO = 1;
export const EXTENSAO_DO_MODELO = '.csv';
const SEP = ';';
const BOM = '\uFEFF';

// ---------------------------------------------------------------- escrever

function reais(n: number | null): string {
  if (n == null) return '';
  return n.toFixed(2).replace('.', ',');
}

function area(n: number | null): string {
  if (n == null) return '';
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

function andarDoModelo(pavimento: number | null): string {
  if (pavimento == null) return 'QUALQUER';
  return pavimento === 1 ? 'TÉRREO' : `${pavimento - 1}º ANDAR`;
}

function posicaoDoModelo(v: Ventilacao | null): string {
  return v === 'mais' ? 'MAIS VENTILADO' : v === 'menos' ? 'MENOS VENTILADO' : 'QUALQUER';
}

function vagaDoModelo(v: Vaga | null, vazio = 'QUALQUER'): string {
  return v === 'carro' ? 'CARRO' : v === 'moto' ? 'MOTO' : vazio;
}

/**
 * Célula segura: sem quebra de linha dentro, e entre aspas só se tiver o
 * separador ou aspas. A vírgula NÃO conta: é o decimal ("40,94"), e aspas em
 * volta dele fariam o Excel ler o número como texto.
 */
function celula(v: string): string {
  const limpo = v.replace(/[\r\n]+/g, ' ').trim();
  return /[;"]/.test(limpo) ? `"${limpo.replace(/"/g, '""')}"` : limpo;
}

function linha(...cells: string[]): string {
  return cells.map(celula).join(SEP);
}

type ConteudoDoModelo = Pick<TabelaDePreco, 'referencia' | 'regras' | 'vagas' | 'precosPorUnidade'>;

/** A tabela no modelo POUP, pronta para salvar como `.csv`. */
export function gerarModelo(t: ConteudoDoModelo, empreendimento: string): string {
  const l: string[] = [
    linha('MODELO POUP', 'TABELA DE PREÇO', `VERSÃO ${VERSAO_DO_MODELO}`),
    linha('EMPREENDIMENTO', empreendimento),
    linha('REFERÊNCIA', t.referencia),
    linha('VAGA DE QUEM ESTÁ NA LISTA', vagaDoModelo(t.vagas?.vagaDaLista ?? null, '')),
    linha('VAGA DAS DEMAIS UNIDADES', vagaDoModelo(t.vagas?.vagaDasDemais ?? null, 'NÃO INFORMAR')),
    '',
    '[PREÇO POR REGRA]',
    linha('ANDAR', 'POSIÇÃO', 'VAGA', 'ÁREA M²', 'AVALIAÇÃO', 'VENDA'),
    ...t.regras.map((r) =>
      linha(andarDoModelo(r.pavimento), posicaoDoModelo(r.ventilacao), vagaDoModelo(r.vaga), area(r.areaM2), reais(r.avaliacao), reais(r.venda)),
    ),
    '',
    '[LISTA DE VAGAS]',
    linha('BLOCO', 'UNIDADE'),
    ...(t.vagas?.unidades ?? []).map((u) => linha(u.bloco, u.unidade)),
    '',
    '[PREÇO POR UNIDADE]',
    linha('BLOCO', 'UNIDADE', 'VAGA', 'ÁREA M²', 'AVALIAÇÃO', 'VENDA'),
    ...(t.precosPorUnidade ?? []).map((p) =>
      linha(p.bloco, p.unidade, vagaDoModelo(p.vaga, ''), area(p.areaM2), reais(p.avaliacao), reais(p.venda)),
    ),
  ];
  return BOM + l.join('\r\n') + '\r\n';
}

/** O modelo vazio, com as instruções, para quem for preencher à mão. */
export function modeloEmBranco(empreendimento = ''): string {
  const instrucoes = [
    '# COMO PREENCHER (as linhas com # são ignoradas):',
    '# PREÇO POR REGRA: o preço pelo andar, pela posição e pela vaga.',
    '#   ANDAR: TÉRREO, 1º ANDAR, 2º ANDAR... ou QUALQUER.',
    '#   POSIÇÃO: MAIS VENTILADO, MENOS VENTILADO ou QUALQUER.',
    '#   VAGA: CARRO, MOTO ou QUALQUER.',
    '# LISTA DE VAGAS: as unidades que têm a vaga de VAGA DE QUEM ESTÁ NA LISTA.',
    '#   As outras ficam com VAGA DAS DEMAIS UNIDADES.',
    '# PREÇO POR UNIDADE: quando a construtora manda o preço de cada apartamento.',
    '#   Vence o preço por regra. Deixe vazio se não houver.',
    '# Salve como CSV (separado por ponto e vírgula).',
  ];
  const corpo = gerarModelo({ referencia: '', regras: [], vagas: null, precosPorUnidade: [] }, empreendimento)
    .replace(BOM, '')
    .split('\r\n');
  return BOM + [...corpo.slice(0, 5), ...instrucoes, ...corpo.slice(5)].join('\r\n');
}

/** Nome de arquivo para o modelo: "tabela-village-connect-i-setembro.csv". */
export function nomeDoArquivoDoModelo(empreendimento: string, referencia: string): string {
  const base = `tabela ${empreendimento} ${referencia}`
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${base || 'tabela'}${EXTENSAO_DO_MODELO}`;
}

// ---------------------------------------------------------------- ler

export interface LeituraDoModelo {
  empreendimento: string | null;
  referencia: string | null;
  regras: RegraDePreco[];
  vagas: ListaDeVagas | null;
  precosPorUnidade: PrecoDeUnidade[];
  avisos: string[];
}

/** Divide uma linha em células, respeitando aspas ("a;b" é uma célula só). */
function dividir(linhaCrua: string, sep: string): string[] {
  const cells: string[] = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < linhaCrua.length; i++) {
    const c = linhaCrua[i];
    if (aspas) {
      if (c === '"' && linhaCrua[i + 1] === '"') {
        atual += '"';
        i++;
      } else if (c === '"') aspas = false;
      else atual += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) {
      cells.push(atual.trim());
      atual = '';
    } else atual += c;
  }
  cells.push(atual.trim());
  return cells;
}

function separadorDe(primeira: string): string {
  const conta = (s: string) => primeira.split(s).length - 1;
  const opcoes: [string, number][] = [
    [';', conta(';')],
    ['\t', conta('\t')],
    [',', conta(',')],
  ];
  return opcoes.sort((a, b) => b[1] - a[1])[0][1] > 0 ? opcoes[0][0] : ';';
}

/**
 * Dinheiro ou área em qualquer escrita. Um ponto seguido de exatamente três
 * dígitos é milhar ("244.780"); com vírgula presente, o ponto é sempre milhar.
 */
export function valorDoModelo(texto: string): number | null {
  let t = texto.replace(/R\$|\s/gi, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if ((t.match(/\./g) ?? []).length > 1 || /^\d{1,3}\.\d{3}$/.test(t)) t = t.replace(/\./g, '');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

const INVALIDO = Symbol('invalido');
type Lido<T> = T | null | typeof INVALIDO;

function andarLido(texto: string): Lido<number> {
  const n = normalizar(texto).trim();
  if (!n || n === 'QUALQUER' || n === 'TODOS') return null;
  if (n === 'TERREO' || n === '0') return 1;
  const m = /^(\d{1,3})\s*(?:O|°|\.)?\s*(?:ANDAR)?$/.exec(n);
  if (!m) return INVALIDO;
  const pav = Number.parseInt(m[1], 10) + 1;
  return pav >= 1 && pav <= 200 ? pav : INVALIDO;
}

function posicaoLida(texto: string): Lido<Ventilacao> {
  const n = normalizar(texto).trim();
  if (!n || n === 'QUALQUER' || n === 'TODAS') return null;
  if (/^MAIS(\s+VENTILAD[OA])?$/.test(n)) return 'mais';
  if (/^MENOS(\s+VENTILAD[OA])?$/.test(n)) return 'menos';
  return INVALIDO;
}

function vagaLida(texto: string): Lido<Vaga> {
  const n = normalizar(texto).trim();
  if (!n || n === 'QUALQUER' || n === 'NAO INFORMAR' || n === '-') return null;
  if (/^(VAGA\s+DE\s+)?CARROS?$/.test(n)) return 'carro';
  if (/^(VAGA\s+DE\s+)?MOTOS?$/.test(n)) return 'moto';
  return INVALIDO;
}

type Secao = 'cabecalho' | 'regras' | 'vagas' | 'unidades';

function secaoDe(celula0: string): Secao | null {
  const n = normalizar(celula0).replace(/[[\]]/g, '').trim();
  if (/^PRECOS? POR REGRAS?$/.test(n)) return 'regras';
  if (/^LISTA DE VAGAS$/.test(n)) return 'vagas';
  if (/^PRECOS? POR UNIDADES?$/.test(n)) return 'unidades';
  return null;
}

/** O texto está no modelo POUP? (A primeira linha que não é comentário diz.) */
export function ehModeloPoup(texto: string): boolean {
  const primeira = texto
    .replace(BOM, '')
    .split(/\r?\n/)
    .find((l) => l.trim() && !l.trim().startsWith('#'));
  return primeira != null && /MODELO\s+POUP/.test(normalizar(primeira));
}

/**
 * Lê um arquivo no modelo POUP. `null` = não é o modelo (outro CSV qualquer):
 * quem chama diz isso ao corretor, em vez de ler um arquivo errado como tabela.
 */
export function lerModelo(texto: string): LeituraDoModelo | null {
  if (!ehModeloPoup(texto)) return null;
  const linhas = texto.replace(BOM, '').split(/\r?\n/);
  const primeira = linhas.find((l) => l.trim() && !l.trim().startsWith('#')) ?? '';
  const sep = separadorDe(primeira);

  const leitura: LeituraDoModelo = {
    empreendimento: null,
    referencia: null,
    regras: [],
    vagas: null,
    precosPorUnidade: [],
    avisos: [],
  };
  // Objeto (e não `let`): é preenchido dentro do forEach, e o TypeScript não
  // acompanha atribuições a variáveis soltas feitas dentro de callback.
  const cab: { daLista: Lido<Vaga>; demais: Lido<Vaga>; demaisInformada: boolean } = {
    daLista: null,
    demais: null,
    demaisInformada: false,
  };
  const listaDeVagas: { bloco: string; unidade: string }[] = [];
  const vistasRegras = new Set<string>();
  const vistasLista = new Set<string>();
  const vistasUnidades = new Set<string>();
  let secao: Secao = 'cabecalho';

  linhas.forEach((cru, i) => {
    const numero = i + 1;
    if (!cru.trim() || cru.trim().startsWith('#')) return;
    const c = dividir(cru, sep);
    if (c.every((x) => !x)) return;
    const nova = secaoDe(c[0]);
    if (nova) {
      secao = nova;
      return;
    }
    const n0 = normalizar(c[0]).trim();
    const aviso = (msg: string) => leitura.avisos.push(`Linha ${numero}: ${msg}`);

    if (secao === 'cabecalho') {
      const valor = (c[1] ?? '').trim();
      if (/MODELO\s+POUP/.test(n0)) return;
      if (n0 === 'EMPREENDIMENTO') leitura.empreendimento = valor || null;
      else if (/^REFERENCIA/.test(n0)) leitura.referencia = valor || null;
      else if (/^VAGA DE QUEM ESTA NA LISTA/.test(n0)) {
        cab.daLista = vagaLida(valor);
        if (cab.daLista === INVALIDO) aviso(`vaga "${valor}" desconhecida (use CARRO ou MOTO).`);
      } else if (/^VAGA DAS DEMAIS/.test(n0)) {
        cab.demaisInformada = true;
        cab.demais = vagaLida(valor);
        if (cab.demais === INVALIDO) aviso(`vaga "${valor}" desconhecida (use CARRO, MOTO ou NÃO INFORMAR).`);
      } else aviso(`"${c[0]}" não faz parte do cabeçalho do modelo.`);
      return;
    }

    // Cabeçalho de coluna repetido (ou vindo de outra planilha): pula.
    if (n0 === 'ANDAR' || n0 === 'BLOCO') return;

    if (secao === 'regras') {
      const [andar, posicao, vaga, areaTxt, avalTxt, vendaTxt] = c;
      const pavimento = andarLido(andar ?? '');
      const ventilacao = posicaoLida(posicao ?? '');
      const vagaR = vagaLida(vaga ?? '');
      const venda = valorDoModelo(vendaTxt ?? '');
      if (pavimento === INVALIDO) return aviso(`andar "${andar}" não reconhecido.`);
      if (ventilacao === INVALIDO) return aviso(`posição "${posicao}" não reconhecida.`);
      if (vagaR === INVALIDO) return aviso(`vaga "${vaga}" não reconhecida.`);
      if (venda == null || venda <= 0) return aviso('valor de venda ausente ou inválido.');
      const r: RegraDePreco = {
        pavimento,
        ventilacao,
        vaga: vagaR,
        areaM2: valorDoModelo(areaTxt ?? ''),
        avaliacao: valorDoModelo(avalTxt ?? ''),
        venda,
      };
      const chave = `${r.pavimento}|${r.ventilacao}|${r.vaga}`;
      if (vistasRegras.has(chave)) return aviso(`${descreverRegra(r)} aparece duas vezes; ficou a primeira.`);
      vistasRegras.add(chave);
      leitura.regras.push(r);
      return;
    }

    const bloco = (c[0] ?? '').trim();
    const unidade = (c[1] ?? '').trim();
    if (!bloco || !unidade) return aviso('informe o bloco e a unidade.');
    // Pela chave, como no de-para: "06/001" e "6/1" são a mesma unidade.
    const chave = chaveDaUnidadeNoBloco(bloco, unidade);

    if (secao === 'vagas') {
      if (vistasLista.has(chave)) return;
      vistasLista.add(chave);
      listaDeVagas.push({ bloco, unidade });
      return;
    }

    // secao === 'unidades'
    const [, , vaga, areaTxt, avalTxt, vendaTxt] = c;
    const vagaU = vagaLida(vaga ?? '');
    const venda = valorDoModelo(vendaTxt ?? '');
    if (vagaU === INVALIDO) return aviso(`vaga "${vaga}" não reconhecida.`);
    if (venda == null || venda <= 0) return aviso(`bloco ${bloco}, unidade ${unidade}: valor de venda ausente ou inválido.`);
    if (vistasUnidades.has(chave)) return aviso(`bloco ${bloco}, unidade ${unidade} aparece duas vezes; ficou a primeira.`);
    vistasUnidades.add(chave);
    leitura.precosPorUnidade.push({
      bloco,
      unidade,
      venda,
      avaliacao: valorDoModelo(avalTxt ?? ''),
      areaM2: valorDoModelo(areaTxt ?? ''),
      vaga: vagaU,
    });
  });

  const daLista: Vaga | null = cab.daLista === INVALIDO ? null : cab.daLista;
  let demais: Vaga | null = cab.demais === INVALIDO ? null : cab.demais;
  // Sem "vaga das demais" informada, vale a outra vaga (a regra do Connect).
  if (!cab.demaisInformada && daLista) demais = daLista === 'moto' ? 'carro' : 'moto';

  if (listaDeVagas.length > 0 && !daLista) {
    leitura.avisos.push('A lista de vagas foi ignorada: informe a VAGA DE QUEM ESTÁ NA LISTA no cabeçalho.');
  } else if (listaDeVagas.length > 0 || demais) {
    leitura.vagas = { vagaDaLista: daLista ?? 'moto', vagaDasDemais: demais, unidades: listaDeVagas };
  }
  return leitura;
}
