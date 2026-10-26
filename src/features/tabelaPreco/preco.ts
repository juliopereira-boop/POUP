/**
 * O PREÇO DE CADA UNIDADE, A PARTIR DA TABELA DA CONSTRUTORA.
 *
 * ===========================================================================
 * A TABELA NÃO TRAZ UM PREÇO POR APARTAMENTO — TRAZ UMA REGRA
 * ===========================================================================
 * A tabela do Village Connect I (Canopus, setembro) é o modelo: 13 linhas que
 * dizem quanto custa um apartamento conforme três características dele.
 *
 *     ANDAR     POSIÇÃO           VAGA    M2      AVALIAÇÃO     VENDA
 *     Térreo    mais ventilado    moto    40,94   231.900,00    244.780,00
 *     Térreo    menos ventilado   carro   40,94   231.900,00    250.280,00
 *     1º andar  mais ventilado    carro   40,94   241.900,00    261.280,00
 *     ...
 *
 * Então o POUP guarda a REGRA (as linhas) e as CARACTERÍSTICAS de cada
 * unidade, e o preço sai da combinação das duas, aqui:
 *
 *   * o ANDAR vem do pavimento, que o cadastro de blocos já tem;
 *   * a VENTILAÇÃO vem da terminação do código ("301" termina em 1) e da regra
 *     de ventilação do bloco ("finais 1 e 3 são mais ventilados");
 *   * a VAGA sai do de-para com a lista de vagas que veio junto com a tabela
 *     (ver `ListaDeVagas`).
 *
 * A vantagem é a atualização do mês: a construtora manda a tabela nova, e o
 * corretor troca 13 linhas — não 464 apartamentos.
 *
 * ===========================================================================
 * "QUALQUER" E A LINHA MAIS ESPECÍFICA
 * ===========================================================================
 * Nem toda construtora separa por ventilação ou vaga. Uma linha pode deixar
 * qualquer uma das três características em branco, e aí vale para todas. Se
 * mais de uma linha serve, ganha a que descreve mais características — "térreo
 * com vaga de moto" vence "térreo". Se duas igualmente específicas servem com
 * preços diferentes, a unidade fica SEM preço e a tela diz por quê: escolher
 * uma das duas em silêncio seria inventar o preço.
 *
 * ===========================================================================
 * PREÇO POR UNIDADE, QUANDO A CONSTRUTORA MANDA ASSIM
 * ===========================================================================
 * Muitas construtoras mandam o "espelho": um preço para cada apartamento. A
 * tabela também guarda isso (`precosPorUnidade`), e o preço da unidade VENCE
 * a regra — é a informação mais específica que existe. As duas formas convivem
 * no mesmo modelo de arquivo (`modelo.ts`).
 *
 * Tudo aqui é puro (sem React, sem banco): roda nos testes em Node.
 */
import { rotuloDoPavimento } from '../unidades/gerador';
import { chaveDaUnidadeNoBloco } from './chaves';

export type Vaga = 'carro' | 'moto';
export type Ventilacao = 'mais' | 'menos';

export const VAGAS: Vaga[] = ['carro', 'moto'];
export const VENTILACOES: Ventilacao[] = ['mais', 'menos'];

export interface RegraDePreco {
  /** 1 = térreo. `null` = vale para qualquer pavimento. */
  pavimento: number | null;
  /** `null` = vale para mais e menos ventilado. */
  ventilacao: Ventilacao | null;
  /** `null` = vale para carro e moto. */
  vaga: Vaga | null;
  areaM2: number | null;
  /** Valor de avaliação do banco. Informativo: a conta usa a venda. */
  avaliacao: number | null;
  venda: number;
}

/** Uma unidade como a lista da construtora a escreve: bloco "02", unidade "301". */
export interface UnidadeCitada {
  bloco: string;
  unidade: string;
}

/**
 * A LISTA DE VAGAS, GUARDADA COMO VEIO.
 *
 * A tabela do Connect lista as unidades com vaga de MOTO; quem não está na
 * lista tem vaga de CARRO. O POUP guarda a lista, e não a vaga de cada
 * unidade, por um motivo prático: o corretor pode enviar a tabela antes de
 * terminar o cadastro de blocos. Guardando a lista, o de-para é refeito a cada
 * leitura — o bloco cadastrado amanhã já nasce com a vaga certa.
 */
export interface ListaDeVagas {
  /** A vaga de quem ESTÁ na lista. */
  vagaDaLista: Vaga;
  /** A vaga de quem NÃO está na lista. `null` = fica sem vaga definida. */
  vagaDasDemais: Vaga | null;
  unidades: UnidadeCitada[];
}

/** O preço de UM apartamento, quando a construtora manda o espelho. */
export interface PrecoDeUnidade {
  /** Como veio escrito: "02", "Bloco 2" — casa pela chave (`chaves.ts`). */
  bloco: string;
  unidade: string;
  venda: number;
  avaliacao: number | null;
  areaM2: number | null;
  /** A vaga desta unidade, se o espelho diz. Vence a lista de vagas. */
  vaga: Vaga | null;
}

export interface ArquivoDaTabela {
  /** Caminho no Storage: `<id do empreendimento>/<arquivo>.pdf`. */
  path: string;
  nome: string;
}

export interface TabelaDePreco {
  /** Como a construtora chama a tabela: "Setembro/2026". */
  referencia: string;
  atualizadoEm: string | null;
  regras: RegraDePreco[];
  vagas: ListaDeVagas | null;
  /** Preço de apartamentos específicos. Vence a regra. */
  precosPorUnidade: PrecoDeUnidade[];
  /** O arquivo que a construtora mandou (PDF ou modelo POUP), guardado junto. */
  arquivo: ArquivoDaTabela | null;
}

/** O que o cálculo precisa saber da unidade. */
export interface UnidadeParaPreco {
  codigo: string;
  pavimento: number;
  vaga: Vaga | null;
}

/** O que o cálculo precisa saber do bloco. */
export interface BlocoParaPreco {
  /** Terminações mais ventiladas. `null` = o bloco ainda não tem regra. */
  terminacoesMaisVentiladas: number[] | null;
}

export type MotivoSemPreco = 'sem_tabela' | 'sem_vaga' | 'sem_ventilacao' | 'sem_linha' | 'ambigua';

export type PrecoDaUnidade =
  | {
      ok: true;
      venda: number;
      avaliacao: number | null;
      areaM2: number | null;
      vaga: Vaga | null;
      ventilacao: Ventilacao | null;
      /** A linha usada. `null` quando o preço veio da própria unidade. */
      regra: RegraDePreco | null;
      origem: 'regra' | 'unidade';
    }
  | { ok: false; motivo: MotivoSemPreco; mensagem: string };

export const LIMITE_REGRAS = 500;
export const LIMITE_PRECOS_POR_UNIDADE = 20000;

/** A tabela tem algum preço (por regra ou por unidade)? */
export function temPrecos(t: Pick<TabelaDePreco, 'regras' | 'precosPorUnidade'> | null): boolean {
  return Boolean(t && (t.regras.length > 0 || (t.precosPorUnidade?.length ?? 0) > 0));
}

// ---------------------------------------------------------------- rótulos

export function rotuloVaga(v: Vaga | null): string {
  if (v === 'carro') return 'Vaga de carro';
  if (v === 'moto') return 'Vaga de moto';
  return 'Vaga não definida';
}

export function rotuloVentilacao(v: Ventilacao | null): string {
  if (v === 'mais') return 'Mais ventilado';
  if (v === 'menos') return 'Menos ventilado';
  return 'Ventilação não definida';
}

/** "Térreo · mais ventilado · moto" — como a linha aparece para gente. */
export function descreverRegra(r: Pick<RegraDePreco, 'pavimento' | 'ventilacao' | 'vaga'>): string {
  return [
    r.pavimento == null ? 'Qualquer andar' : rotuloDoPavimento(r.pavimento),
    r.ventilacao == null ? null : rotuloVentilacao(r.ventilacao).toLowerCase(),
    r.vaga == null ? null : r.vaga,
  ]
    .filter(Boolean)
    .join(' · ');
}

// ---------------------------------------------------------------- ventilação

/**
 * A terminação é a posição da unidade no andar: os dois últimos dígitos do
 * código. "301" → 1, "1004" → 4, "A12" → 12. É por ela que a construtora diz
 * quem é mais ventilado, e ela não muda de um andar para outro.
 */
export function terminacaoDoCodigo(codigo: string): number | null {
  const m = /(\d{1,2})$/.exec(codigo.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return n >= 1 ? n : null;
}

export function ventilacaoDaUnidade(
  codigo: string,
  terminacoesMaisVentiladas: number[] | null,
): Ventilacao | null {
  if (terminacoesMaisVentiladas == null) return null;
  const t = terminacaoDoCodigo(codigo);
  if (t == null) return null;
  return terminacoesMaisVentiladas.includes(t) ? 'mais' : 'menos';
}

/** "Mais ventilado: finais 1 e 3 · Menos: 2 e 4". */
export function resumoDaVentilacao(mais: number[] | null, terminacoes: number[]): string {
  if (mais == null) return 'Sem regra de ventilação';
  const lista = (ns: number[]) =>
    ns.length === 0 ? 'nenhum' : ns.length === 1 ? String(ns[0]) : `${ns.slice(0, -1).join(', ')} e ${ns.at(-1)}`;
  const m = [...mais].sort((a, b) => a - b);
  const menos = terminacoes.filter((t) => !mais.includes(t)).sort((a, b) => a - b);
  return `Mais ventilado: finais ${lista(m)} · Menos: ${lista(menos)}`;
}

// ---------------------------------------------------------------- vaga

/**
 * A função que diz a vaga de cada unidade, montada uma vez por tabela.
 *
 * Um condomínio tem centenas de unidades e a lista, outras centenas; montar o
 * conjunto uma vez e consultar por chave evita comparar lista com lista a cada
 * apartamento desenhado na tela.
 */
export function leitorDeVagas(
  tabela: Pick<TabelaDePreco, 'vagas'> | null,
): (nomeDoBloco: string, codigo: string) => Vaga | null {
  const lista = tabela?.vagas;
  if (!lista) return () => null;
  const naLista = new Set(lista.unidades.map((u) => chaveDaUnidadeNoBloco(u.bloco, u.unidade)));
  return (nomeDoBloco, codigo) =>
    naLista.has(chaveDaUnidadeNoBloco(nomeDoBloco, codigo)) ? lista.vagaDaLista : lista.vagaDasDemais;
}

// ---------------------------------------------------------------- o preço

function especificidade(r: RegraDePreco): number {
  return (r.pavimento != null ? 1 : 0) + (r.ventilacao != null ? 1 : 0) + (r.vaga != null ? 1 : 0);
}

function semPreco(motivo: MotivoSemPreco, mensagem: string): PrecoDaUnidade {
  return { ok: false, motivo, mensagem };
}

export function precoDaUnidade(
  unidade: UnidadeParaPreco,
  bloco: BlocoParaPreco,
  tabela: TabelaDePreco | null,
): PrecoDaUnidade {
  if (!temPrecos(tabela) || !tabela) {
    return semPreco('sem_tabela', 'Este empreendimento ainda não tem tabela de preço.');
  }
  if (tabela.regras.length === 0) {
    return semPreco('sem_linha', 'Esta unidade não está no preço por unidade da tabela.');
  }

  const ventilacao = ventilacaoDaUnidade(unidade.codigo, bloco.terminacoesMaisVentiladas);
  const doAndar = tabela.regras.filter((r) => r.pavimento == null || r.pavimento === unidade.pavimento);
  const servem = doAndar.filter(
    (r) =>
      (r.ventilacao == null || r.ventilacao === ventilacao) && (r.vaga == null || r.vaga === unidade.vaga),
  );

  if (servem.length === 0) {
    // Por que nenhuma serviu? Faltar um dado da unidade é consertável no
    // cadastro, e a mensagem precisa apontar qual.
    const ventilacaoServe = (r: RegraDePreco) =>
      r.ventilacao == null || ventilacao == null || r.ventilacao === ventilacao;
    if (unidade.vaga == null && doAndar.some((r) => r.vaga != null && ventilacaoServe(r))) {
      return semPreco('sem_vaga', 'A vaga desta unidade não foi definida.');
    }
    if (ventilacao == null && doAndar.some((r) => r.ventilacao != null)) {
      return semPreco('sem_ventilacao', 'O bloco desta unidade ainda não tem regra de ventilação.');
    }
    return semPreco(
      'sem_linha',
      `A tabela não tem linha para ${descreverRegra({
        pavimento: unidade.pavimento,
        ventilacao,
        vaga: unidade.vaga,
      }).toLowerCase()}.`,
    );
  }

  const maior = Math.max(...servem.map(especificidade));
  const melhores = servem.filter((r) => especificidade(r) === maior);
  if (new Set(melhores.map((r) => r.venda)).size > 1) {
    return semPreco('ambigua', 'Duas linhas da tabela servem para esta unidade, com preços diferentes.');
  }

  const regra = melhores[0];
  return {
    ok: true,
    venda: regra.venda,
    avaliacao: regra.avaliacao,
    areaM2: regra.areaM2,
    vaga: unidade.vaga,
    ventilacao,
    regra,
    origem: 'regra',
  };
}

// ---------------------------------------------------------------- o cadastro inteiro

interface UnidadeDoCadastro {
  codigo: string;
  pavimento: number;
  /** A coluna `valor` da unidade, anterior à tabela por regra. */
  valor?: number | null;
}

interface BlocoDoCadastro<U extends UnidadeDoCadastro> extends BlocoParaPreco {
  nome: string;
  unidades: U[];
}

export type UnidadePrecificada<U> = U & {
  vaga: Vaga | null;
  ventilacao: Ventilacao | null;
  preco: PrecoDaUnidade;
  /**
   * O valor de venda que o simulador usa. Com tabela, vale a tabela — inclusive
   * para dizer que a unidade não tem preço. Sem tabela, vale o `valor` gravado
   * direto na unidade.
   */
  valorDeVenda: number | null;
};

type UnidadeDe<B extends BlocoDoCadastro<UnidadeDoCadastro>> = B['unidades'][number];

export type BlocoPrecificado<B extends BlocoDoCadastro<UnidadeDoCadastro>> = Omit<B, 'unidades'> & {
  unidades: UnidadePrecificada<UnidadeDe<B>>[];
};

/** Cada unidade do cadastro com a vaga, a ventilação e o preço calculados. */
export function precificarBlocos<B extends BlocoDoCadastro<UnidadeDoCadastro>>(
  blocos: B[],
  tabela: TabelaDePreco | null,
): BlocoPrecificado<B>[] {
  const vagaDe = leitorDeVagas(tabela);
  const comTabela = temPrecos(tabela);
  const fixos = new Map(
    (tabela?.precosPorUnidade ?? []).map((p) => [chaveDaUnidadeNoBloco(p.bloco, p.unidade), p]),
  );
  return blocos.map((b) => ({
    ...b,
    unidades: b.unidades.map((u) => {
      const ventilacao = ventilacaoDaUnidade(u.codigo, b.terminacoesMaisVentiladas);
      const fixo = fixos.get(chaveDaUnidadeNoBloco(b.nome, u.codigo));
      const vaga = fixo?.vaga ?? vagaDe(b.nome, u.codigo);
      const preco: PrecoDaUnidade = fixo
        ? {
            ok: true,
            venda: fixo.venda,
            avaliacao: fixo.avaliacao,
            areaM2: fixo.areaM2,
            vaga,
            ventilacao,
            regra: null,
            origem: 'unidade',
          }
        : precoDaUnidade({ codigo: u.codigo, pavimento: u.pavimento, vaga }, b, tabela);
      return {
        ...u,
        vaga,
        ventilacao,
        preco,
        valorDeVenda: comTabela ? (preco.ok ? preco.venda : null) : (u.valor ?? null),
      };
    }),
  }));
}

// ---------------------------------------------------------------- conferência

export interface FaltaDePreco {
  motivo: MotivoSemPreco;
  mensagem: string;
  quantidade: number;
  /** Nomes dos blocos onde a falta aparece, na ordem do cadastro. */
  blocos: string[];
}

export interface Cobertura {
  total: number;
  comPreco: number;
  faltas: FaltaDePreco[];
}

const MENSAGEM_DA_FALTA: Record<MotivoSemPreco, string> = {
  sem_tabela: 'sem tabela de preço',
  sem_vaga: 'sem vaga definida',
  sem_ventilacao: 'em bloco sem regra de ventilação',
  sem_linha: 'sem linha correspondente na tabela',
  ambigua: 'com duas linhas da tabela em conflito',
};

/** Quantas unidades têm preço, e o que falta para as outras terem. */
export function coberturaDaTabela(
  blocos: { nome: string; unidades: { preco: PrecoDaUnidade }[] }[],
): Cobertura {
  let total = 0;
  let comPreco = 0;
  const faltas = new Map<MotivoSemPreco, FaltaDePreco>();
  for (const b of blocos) {
    for (const u of b.unidades) {
      total++;
      if (u.preco.ok) {
        comPreco++;
        continue;
      }
      const motivo = u.preco.motivo;
      const f = faltas.get(motivo) ?? {
        motivo,
        mensagem: MENSAGEM_DA_FALTA[motivo],
        quantidade: 0,
        blocos: [],
      };
      f.quantidade++;
      if (!f.blocos.includes(b.nome)) f.blocos.push(b.nome);
      faltas.set(motivo, f);
    }
  }
  return { total, comPreco, faltas: [...faltas.values()] };
}

/** Menor e maior preço de um bloco: ajuda o corretor a escolher o bloco. */
export function faixaDoBloco(bloco: {
  unidades: { valorDeVenda: number | null }[];
}): { min: number; max: number } | null {
  const valores = bloco.unidades.map((u) => u.valorDeVenda).filter((v): v is number => v != null);
  if (valores.length === 0) return null;
  return { min: Math.min(...valores), max: Math.max(...valores) };
}

// ---------------------------------------------------------------- validação

export type ValidacaoDasRegras = { ok: true } | { ok: false; erro: string };

/** O preço por unidade: venda positiva e nenhuma unidade repetida. */
export function validarPrecosPorUnidade(precos: PrecoDeUnidade[]): ValidacaoDasRegras {
  if (precos.length > LIMITE_PRECOS_POR_UNIDADE) {
    return { ok: false, erro: `O preço por unidade pode ter no máximo ${LIMITE_PRECOS_POR_UNIDADE} unidades.` };
  }
  const vistas = new Set<string>();
  for (const p of precos) {
    const nome = `Bloco ${p.bloco}, unidade ${p.unidade}`;
    if (!(p.venda > 0)) return { ok: false, erro: `${nome}: informe o valor de venda.` };
    const chave = chaveDaUnidadeNoBloco(p.bloco, p.unidade);
    if (vistas.has(chave)) return { ok: false, erro: `${nome} aparece duas vezes no preço por unidade.` };
    vistas.add(chave);
  }
  return { ok: true };
}

/** O que o banco também confere, dito antes, em frase de gente. */
export function validarRegras(regras: RegraDePreco[]): ValidacaoDasRegras {
  if (regras.length > LIMITE_REGRAS) {
    return { ok: false, erro: `A tabela pode ter no máximo ${LIMITE_REGRAS} linhas.` };
  }
  const vistas = new Set<string>();
  for (const [i, r] of regras.entries()) {
    const linha = `Linha ${i + 1}`;
    if (!(r.venda > 0)) return { ok: false, erro: `${linha}: informe o valor de venda.` };
    if (r.avaliacao != null && !(r.avaliacao > 0)) {
      return { ok: false, erro: `${linha}: a avaliação precisa ser maior que zero.` };
    }
    if (r.areaM2 != null && !(r.areaM2 > 0)) {
      return { ok: false, erro: `${linha}: a área precisa ser maior que zero.` };
    }
    if (r.pavimento != null && !(Number.isInteger(r.pavimento) && r.pavimento >= 1 && r.pavimento <= 200)) {
      return { ok: false, erro: `${linha}: andar inválido.` };
    }
    const chave = `${r.pavimento ?? '*'}|${r.ventilacao ?? '*'}|${r.vaga ?? '*'}`;
    if (vistas.has(chave)) {
      return { ok: false, erro: `${linha}: a combinação ${descreverRegra(r).toLowerCase()} aparece duas vezes.` };
    }
    vistas.add(chave);
  }
  return { ok: true };
}
