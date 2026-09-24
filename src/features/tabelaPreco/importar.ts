/**
 * LER O TEXTO DA TABELA DE PREÇO DA CONSTRUTORA.
 *
 * A tabela chega em PDF, todo mês. Digitar 13 linhas de valores é onde nasce o
 * erro de um dígito que ninguém percebe até a proposta sair errada — então o
 * corretor envia o PDF no cadastro do empreendimento, o servidor tira o texto
 * dele (Edge Function `ler-tabela-preco`) e o POUP lê aqui. Colar o texto
 * copiado do PDF chega no mesmo lugar.
 *
 * ===========================================================================
 * O QUE CHEGA DE UM PDF
 * ===========================================================================
 * Nada de colunas: cada célula vira um pedaço de texto, às vezes numa linha
 * própria, às vezes separado por tabulação, conforme quem extraiu. Por isso
 * a leitura NÃO depende de linhas nem de colunas. Ela procura o começo de cada
 * registro ("TÉRREO", "1º ANDAR"...) e, dentro dele, reconhece cada
 * característica pelo que ela é:
 *
 *   * "MAIS/MENOS VENTILADO"  → a posição;
 *   * "MOTO" / "CARRO"        → a vaga;
 *   * "R$ 231.900,00"         → dinheiro: com dois valores, o primeiro é a
 *                               avaliação e o segundo a venda (a ordem das
 *                               colunas da tabela); com um só, é a venda;
 *   * um número sem "R$"      → a área em m².
 *
 * A lista de unidades ("BL 02 APTO 301") segue a mesma ideia: acha o bloco e o
 * apartamento onde quer que estejam no texto.
 *
 * ===========================================================================
 * O DE-PARA DAS VAGAS
 * ===========================================================================
 * A tabela do Connect lista só as unidades com vaga de MOTO. Quem não está na
 * lista tem vaga de carro. A lista é guardada com a tabela e o de-para com o
 * cadastro de blocos é refeito a cada leitura (`leitorDeVagas`, em
 * `preco.ts`). O que a lista cita mas o cadastro não tem aparece para o
 * corretor conferir — nunca é descartado em silêncio.
 */
import { chaveDaUnidade, chaveDaUnidadeNoBloco, chaveDoBloco, normalizar } from './chaves';
import {
  LIMITE_REGRAS,
  descreverRegra,
  type ListaDeVagas,
  type RegraDePreco,
  type UnidadeCitada,
  type Vaga,
} from './preco';

export { normalizar };

/** "231.900,00" → 231900. "40,94" → 40.94. */
export function numeroBR(texto: string): number | null {
  const limpo = texto.trim().replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(limpo)) return null;
  const n = Number.parseFloat(limpo);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------- a regra

export interface LeituraDaTabela {
  regras: RegraDePreco[];
  /** O que foi lido mas não pôde virar linha, para o corretor conferir. */
  avisos: string[];
  /** "Setembro", quando o texto traz "TABELA DE SETEMBRO". */
  referencia: string | null;
}

/** O começo de um registro: "TERREO" ou "3O ANDAR" / "3° ANDAR" / "3 ANDAR". */
const INICIO_DO_REGISTRO = /\b(?:TERREO|(\d{1,3})\s*(?:O|°|\.)?\s*ANDAR)\b/g;
/** Onde a tabela de preços acaba e começa a lista de unidades. */
const FIM_DOS_REGISTROS = /\bBL(?:OCO)?\b|\bUNIDADE\b/;
const DINHEIRO = /R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/g;

function capitalizar(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

export function lerTabelaColada(texto: string): LeituraDaTabela {
  const n = normalizar(texto);
  const regras: RegraDePreco[] = [];
  const avisos: string[] = [];
  const vistas = new Set<string>();

  const ref = /TABELA\s+(?:DE\s+PRECOS?\s+)?(?:DE\s+|-\s*)?([A-Z]{4,9}(?:\s*(?:DE\s*|\/\s*)?\d{4})?)/.exec(n);
  const MESES = /^(JANEIRO|FEVEREIRO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)/;
  const referencia = ref && MESES.test(ref[1]) ? capitalizar(ref[1].replace(/\s+/g, ' ').trim()) : null;

  // A ordem das colunas de dinheiro vem do cabeçalho. O Connect traz
  // AVALIAÇÃO antes de VENDA; se outra construtora inverter, a leitura inverte.
  const colAvaliacao = n.search(/\bAVALIACAO\b/);
  const colVenda = n.search(/\bVENDA\b/);
  const vendaPrimeiro = colAvaliacao >= 0 && colVenda >= 0 && colVenda < colAvaliacao;

  const inicios = [...n.matchAll(INICIO_DO_REGISTRO)];
  for (const [i, m] of inicios.entries()) {
    const fimDoTrecho = i + 1 < inicios.length ? inicios[i + 1].index : n.length;
    let trecho = n.slice(m.index + m[0].length, fimDoTrecho);
    const corte = FIM_DOS_REGISTROS.exec(trecho);
    if (corte) trecho = trecho.slice(0, corte.index);

    const pavimento = m[1] == null ? 1 : Number.parseInt(m[1], 10) + 1;
    const vent = /\b(MAIS|MENOS)\s+VENTILAD[OA]S?\b/.exec(trecho);
    const vaga = /\b(MOTO|CARRO)S?\b/.exec(trecho);
    const valores = [...trecho.matchAll(DINHEIRO)].map((d) => numeroBR(d[1]));
    const semDinheiro = trecho.replace(DINHEIRO, ' ');
    const area = /(?:^|\s)(\d{1,4}(?:,\d{1,2})?)(?=\s|M2|$)/.exec(semDinheiro);

    const base = {
      pavimento,
      ventilacao: vent ? (vent[1] === 'MAIS' ? 'mais' : 'menos') : null,
      vaga: vaga ? (vaga[1] === 'MOTO' ? 'moto' : 'carro') : null,
    } as const;
    const nome = descreverRegra(base);

    if (valores.length === 0) continue; // um "3º andar" solto no texto, não um registro
    if (valores.length > 2 || valores.some((v) => v == null || v <= 0)) {
      avisos.push(`${nome}: não deu para separar avaliação e venda.`);
      continue;
    }
    const chave = `${base.pavimento}|${base.ventilacao}|${base.vaga}`;
    if (vistas.has(chave)) {
      avisos.push(`${nome}: aparece duas vezes; ficou a primeira.`);
      continue;
    }
    vistas.add(chave);
    regras.push({
      ...base,
      areaM2: area ? numeroBR(area[1]) : null,
      avaliacao: valores.length === 2 ? (valores[vendaPrimeiro ? 1 : 0] as number) : null,
      venda: (valores.length === 2 ? valores[vendaPrimeiro ? 0 : 1] : valores[0]) as number,
    });
    if (regras.length >= LIMITE_REGRAS) break;
  }

  return { regras, avisos, referencia };
}

// ---------------------------------------------------------------- unidades

/** Uma unidade citada, com o trecho original para mostrar ao corretor. */
export interface UnidadeLida extends UnidadeCitada {
  /** "BL 02 APTO 301", como veio. */
  texto: string;
}

const UNIDADE_CITADA =
  /\b(?:BLOCO|BL|TORRE|QUADRA|QD)\.?\s*([A-Z]?\d{1,3}[A-Z]?|[A-Z])\s*[-–—,:/]?\s*(?:APARTAMENTO|APTO|APT|AP|UNIDADE|UN|CASA|LOTE)?\.?\s*(\d{1,4})\b/g;

export const LIMITE_UNIDADES_CITADAS = 20000;

export function lerUnidadesColadas(texto: string): UnidadeLida[] {
  const vistas = new Set<string>();
  const lista: UnidadeLida[] = [];
  for (const m of normalizar(texto).matchAll(UNIDADE_CITADA)) {
    const item = { bloco: m[1], unidade: m[2], texto: m[0].replace(/\s+/g, ' ').trim() };
    const chave = chaveDaUnidadeNoBloco(item.bloco, item.unidade);
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    lista.push(item);
    if (lista.length >= LIMITE_UNIDADES_CITADAS) break;
  }
  return lista;
}

/**
 * Que vaga a lista descreve? A do Connect repete "vaga de moto" em toda linha.
 * Conta as duas e fica com a que aparece mais; sem nenhuma, `null` — e a tela
 * pergunta ao corretor.
 */
export function vagaDescritaNaLista(texto: string): Vaga | null {
  const n = normalizar(texto);
  const moto = (n.match(/\bVAGAS?\s+(?:DE\s+)?MOTOS?\b/g) ?? []).length;
  const carro = (n.match(/\bVAGAS?\s+(?:DE\s+)?CARROS?\b/g) ?? []).length;
  if (moto === 0 && carro === 0) return null;
  return moto >= carro ? 'moto' : 'carro';
}

export function outraVaga(v: Vaga): Vaga {
  return v === 'moto' ? 'carro' : 'moto';
}

// ---------------------------------------------------------------- o PDF inteiro

export interface LeituraDoPdf extends LeituraDaTabela {
  /** A lista de vagas, quando o PDF traz uma. */
  vagas: ListaDeVagas | null;
  /** As unidades citadas, com o trecho original: é o que a conferência mostra. */
  unidadesLidas: UnidadeLida[];
}

/**
 * Tudo o que dá para tirar do texto do PDF: as linhas de preço, a referência e
 * a lista de vagas. A vaga de quem não está na lista é a outra — é a regra do
 * Connect ("quem não está na lista de moto tem vaga de carro"), e o corretor
 * pode mudar na tela antes de salvar.
 */
export function lerTextoDaTabela(texto: string): LeituraDoPdf {
  const tabela = lerTabelaColada(texto);
  const unidadesLidas = lerUnidadesColadas(texto);
  const vaga = vagaDescritaNaLista(texto);
  const vagas: ListaDeVagas | null =
    unidadesLidas.length > 0 && vaga
      ? {
          vagaDaLista: vaga,
          vagaDasDemais: outraVaga(vaga),
          unidades: unidadesLidas.map(({ bloco, unidade }) => ({ bloco, unidade })),
        }
      : null;
  return { ...tabela, vagas, unidadesLidas };
}

// ---------------------------------------------------------------- de-para

interface BlocoDoCadastro {
  nome: string;
  unidades: { codigo: string }[];
}

export interface NaoEncontrada {
  item: UnidadeCitada;
  motivo: string;
}

export interface ConferenciaDaLista {
  /** Unidades do cadastro que estão na lista. */
  naLista: number;
  /** Unidades do cadastro que não estão: recebem a vaga das demais. */
  foraDaLista: number;
  /** O que a lista cita e o cadastro não tem — para o corretor conferir. */
  naoEncontradas: NaoEncontrada[];
}

/**
 * Compara a lista de vagas com o cadastro de blocos.
 *
 * Não muda nada: a vaga de cada unidade é sempre calculada da lista na hora
 * (`leitorDeVagas`). Isto só responde, para a tela, quantas casaram e quais
 * a lista cita sem existir no cadastro.
 */
export function conferirListaDeVagas(
  blocos: BlocoDoCadastro[],
  lista: ListaDeVagas | null,
): ConferenciaDaLista {
  const total = blocos.reduce((s, b) => s + b.unidades.length, 0);
  if (!lista) return { naLista: 0, foraDaLista: total, naoEncontradas: [] };

  const porChave = new Map<string, BlocoDoCadastro[]>();
  for (const b of blocos) {
    const k = chaveDoBloco(b.nome);
    porChave.set(k, [...(porChave.get(k) ?? []), b]);
  }

  let naLista = 0;
  const naoEncontradas: NaoEncontrada[] = [];
  for (const item of lista.unidades) {
    const candidatos = porChave.get(chaveDoBloco(item.bloco)) ?? [];
    if (candidatos.length === 0) {
      naoEncontradas.push({ item, motivo: 'bloco não cadastrado' });
      continue;
    }
    if (candidatos.length > 1) {
      naoEncontradas.push({ item, motivo: 'dois blocos do cadastro têm esse nome' });
      continue;
    }
    const alvo = chaveDaUnidade(item.unidade);
    if (!candidatos[0].unidades.some((u) => chaveDaUnidade(u.codigo) === alvo)) {
      naoEncontradas.push({ item, motivo: `não existe no ${candidatos[0].nome}` });
      continue;
    }
    naLista++;
  }
  return { naLista, foraDaLista: total - naLista, naoEncontradas };
}
