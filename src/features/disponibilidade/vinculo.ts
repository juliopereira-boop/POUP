/**
 * O VÍNCULO ENTRE A UNIDADE DO CV E A UNIDADE DO POUP.
 *
 * ===========================================================================
 * A REGRA QUE NÃO PODE QUEBRAR: UNIDADE X COM UNIDADE X
 * ===========================================================================
 * A cor que o corretor vê ("vendida", "disponível") é a de UMA unidade do CV.
 * Se o vínculo apontar para a unidade vizinha, o corretor oferece um
 * apartamento vendido como disponível — e o erro não aparece em tela nenhuma.
 *
 * Por isso o vínculo é feito UMA vez, aqui, pela mesma chave que a tabela de
 * preço já usa (`../tabelaPreco/chaves.ts`: "BL 02 APTO 001" e
 * "Bloco 2"/"001" viram "2|1"), e GRAVADO pelo id da unidade no CV
 * (`idunidade`). Depois de gravado, ninguém mais compara nome: a
 * disponibilidade é lida pela chave.
 *
 * O que este arquivo faz, e o que ele se recusa a fazer:
 *   • casa só quando a chave é IGUAL e única dos dois lados;
 *   • chave repetida em qualquer lado vira conflito, não palpite;
 *   • identificador que não reconhece vira "não reconhecido", não palpite;
 *   • não existe "parecido": não há distância de texto em lugar nenhum.
 *
 * Formatos reais do CV da Canopus (26/10/2026) — o identificador é montado
 * pelo banco (`cvcrm_identificador`): bloco + nome da unidade.
 *   "Bloco 29 Apto 304"      (Connect I, Alvorada IV)
 *   "BLOCO 46 UNIDADE 304"   (Reserva II, Estrelas, Águas II; térreo "UNIDADE 1")
 *   "Torre 09 Apto 702"      (Prime Calhau IV — no POUP, "Bloco 9")
 *   "Quadra F Casa 19"       (Parque Ville, Del Ville II)
 * ===========================================================================
 */
import { chaveDaUnidade, chaveDoBloco, normalizar } from '../tabelaPreco/chaves';

/** A unidade como o espelho do banco a guarda (`cvcrm_unidades`). */
export interface UnidadeCv {
  cvUnidade: number;
  identificador: string | null;
  situacao?: string | null;
}

/** A unidade do cadastro do POUP, já com o nome do bloco dela. */
export interface UnidadePoup {
  id: string;
  bloco: string;
  codigo: string;
}

export interface IdentificadorLido {
  /** `null` quando o identificador não tem bloco/quadra ("Casa 12"). */
  bloco: string | null;
  unidade: string;
  /** Casa e lote são térreos; apartamento e "unidade" numerada têm o andar no código. */
  tipo: 'apartamento' | 'unidade' | 'casa' | 'lote' | 'outro';
}

// O prefixo precisa estar no começo ou depois de algo que não é letra: "TR"
// não pode casar dentro de "ENTRADA". As alternativas vão da mais longa para a
// mais curta, senão "BL" ganharia de "BLOCO" e "AP" de "APTO".
const BLOCO = /(?:^|[^A-Z])(BLOCO|BL|TORRE|TR|QUADRA|QD|EDIFICIO|ED)\.?\s*([A-Z0-9]+)/;
const UNIDADE =
  /(?:^|[^A-Z])(APARTAMENTO|APTO|APT|AP|CASA|LOTE|LT|UNIDADE|UND|SALA|LOJA)\.?\s*([A-Z0-9]+(?:-[A-Z0-9]+)?)/;

function tipoDoPrefixo(prefixo: string): IdentificadorLido['tipo'] {
  if (prefixo.startsWith('AP')) return 'apartamento';
  if (prefixo === 'UNIDADE' || prefixo === 'UND') return 'unidade';
  if (prefixo === 'CASA') return 'casa';
  if (prefixo === 'LOTE' || prefixo === 'LT') return 'lote';
  return 'outro';
}

/** "Bloco 01 Apto. 005" → { bloco: "01", unidade: "005", tipo: "apartamento" }. */
export function lerIdentificador(identificador: string | null | undefined): IdentificadorLido | null {
  if (!identificador) return null;
  const t = normalizar(identificador).replace(/\s+/g, ' ').trim();
  if (!t || t === 'NULL') return null;
  const u = UNIDADE.exec(t);
  if (!u) return null;
  const b = BLOCO.exec(t);
  return { bloco: b ? b[2] : null, unidade: u[2], tipo: tipoDoPrefixo(u[1]) };
}

/** A chave de comparação: a MESMA de `chaveDaUnidadeNoBloco`, "2|1". */
export function chaveDoIdentificador(lido: IdentificadorLido, blocoUnico: string | null = null): string | null {
  const bloco = lido.bloco ?? blocoUnico;
  if (bloco == null) return null;
  return `${chaveDoBloco(bloco)}|${chaveDaUnidade(lido.unidade)}`;
}

export interface Par {
  unitId: string;
  cv: UnidadeCv;
}

export interface Sugestao {
  /** Chave igual e única dos dois lados. Pode ser gravado. */
  casadas: Par[];
  /** Já vinculadas exatamente assim. Nada a fazer. */
  jaVinculadas: Par[];
  /** A unidade do POUP já está vinculada a OUTRA unidade do CV. Decisão humana. */
  divergentes: { unitId: string; atual: number; sugerida: UnidadeCv }[];
  /** Mesma chave em mais de uma unidade, de um lado ou do outro. */
  conflitos: { chave: string; poup: string[]; cv: UnidadeCv[] }[];
  soNoPoup: UnidadePoup[];
  soNoCv: UnidadeCv[];
  /** Identificador do CV que este arquivo não sabe ler. */
  naoReconhecidas: UnidadeCv[];
}

/**
 * Sugere os pares. Não grava nada: quem grava é o admin, na tela, pela RPC
 * `cvcrm_salvar_vinculos` — que confere tudo de novo no banco.
 *
 * `existentes`: unitId → id da unidade do CV do vínculo já gravado.
 */
export function sugerirVinculos(
  poup: UnidadePoup[],
  cv: UnidadeCv[],
  existentes: Map<string, number> = new Map(),
): Sugestao {
  const s: Sugestao = {
    casadas: [],
    jaVinculadas: [],
    divergentes: [],
    conflitos: [],
    soNoPoup: [],
    soNoCv: [],
    naoReconhecidas: [],
  };

  // Empreendimento de um bloco só, com o CV sem bloco no identificador
  // ("Casa 12"): o bloco é o único que existe. Com dois blocos ou mais, não
  // há como saber, e a unidade fica "não reconhecida".
  const blocosPoup = [...new Set(poup.map((p) => p.bloco))];
  const blocoUnico = blocosPoup.length === 1 ? blocosPoup[0] : null;

  const porChavePoup = new Map<string, UnidadePoup[]>();
  for (const p of poup) {
    const k = `${chaveDoBloco(p.bloco)}|${chaveDaUnidade(p.codigo)}`;
    porChavePoup.set(k, [...(porChavePoup.get(k) ?? []), p]);
  }

  const porChaveCv = new Map<string, UnidadeCv[]>();
  for (const u of cv) {
    const lido = lerIdentificador(u.identificador);
    const k = lido ? chaveDoIdentificador(lido, blocoUnico) : null;
    if (!k) {
      s.naoReconhecidas.push(u);
      continue;
    }
    porChaveCv.set(k, [...(porChaveCv.get(k) ?? []), u]);
  }

  for (const [k, lista] of porChaveCv) {
    const doPoup = porChavePoup.get(k) ?? [];
    if (lista.length > 1 || doPoup.length > 1) {
      s.conflitos.push({ chave: k, poup: doPoup.map((p) => p.id), cv: lista });
      continue;
    }
    if (doPoup.length === 0) {
      s.soNoCv.push(lista[0]);
      continue;
    }
    const par = { unitId: doPoup[0].id, cv: lista[0] };
    const atual = existentes.get(par.unitId);
    if (atual === undefined) s.casadas.push(par);
    else if (atual === par.cv.cvUnidade) s.jaVinculadas.push(par);
    else s.divergentes.push({ unitId: par.unitId, atual, sugerida: par.cv });
  }

  for (const [k, lista] of porChavePoup) {
    if (porChaveCv.has(k)) continue;
    // Repetida só do lado do POUP: também é conflito, para o admin ver os dois
    // blocos que normalizam igual ("Bloco 1" e "Bloco 01").
    if (lista.length > 1) s.conflitos.push({ chave: k, poup: lista.map((p) => p.id), cv: [] });
    else s.soNoPoup.push(lista[0]);
  }

  return s;
}

/**
 * O identificador do CV mudou desde o vínculo? (unidade renomeada no CV)
 *
 * Mudou = o vínculo deixa de valer até o admin confirmar de novo. O banco faz
 * a mesma conferência (`disponibilidade_recalcular`) e, na dúvida, a unidade
 * fica sem cor — nunca com a cor de outra.
 */
export function identificadorMudou(noVinculo: string, atual: string | null): boolean {
  return normalizar(noVinculo).replace(/\s+/g, ' ').trim() !== normalizar(atual ?? '').replace(/\s+/g, ' ').trim();
}

/** "001", "1" e "101" em ordem de andar e posição; código com letra no fim. */
function ordemDaUnidade(codigo: string): number {
  const n = Number.parseInt(codigo, 10);
  return /^\d+$/.test(codigo) ? n : Number.MAX_SAFE_INTEGER;
}

/**
 * A forma dos blocos a partir do CV, para o empreendimento que ainda não tem
 * blocos cadastrados. Sai no formato de `salvar_blocos_empreendimento`.
 *
 * Apartamento e "unidade" numerada: o andar está no código (convenção do
 * gerador do POUP — "001" térreo, "101" 1º andar, "1001" 10º andar), então
 * pavimento = andar + 1. O CV às vezes escreve o térreo sem zeros ("UNIDADE
 * 1"): ele vira "001", o código que o gerador do POUP daria. Casa e lote:
 * térreo, código como o CV escreve.
 */
export function blocosDoCv(
  cv: UnidadeCv[],
): { blocos: { id: null; nome: string; unidades: { codigo: string; pavimento: number; ordem: number }[] }[]; recusadas: UnidadeCv[] } {
  const porBloco = new Map<string, { codigo: string; pavimento: number; ordem: number }[]>();
  const recusadas: UnidadeCv[] = [];
  const lidas = cv
    .map((u) => ({ u, lido: lerIdentificador(u.identificador) }))
    .sort((a, b) => {
      const ba = a.lido?.bloco ?? '';
      const bb = b.lido?.bloco ?? '';
      if (ba !== bb) return ba.localeCompare(bb, 'pt-BR', { numeric: true });
      return ordemDaUnidade(a.lido?.unidade ?? '') - ordemDaUnidade(b.lido?.unidade ?? '');
    });
  for (const { u, lido } of lidas) {
    if (!lido || lido.bloco == null) {
      recusadas.push(u);
      continue;
    }
    const numerico = /^\d+$/.test(lido.unidade);
    const andar = lido.tipo === 'apartamento' || lido.tipo === 'unidade';
    const n = Number.parseInt(lido.unidade, 10);
    const pavimento = andar && numerico ? Math.floor(n / 100) + 1 : 1;
    if (pavimento < 1 || pavimento > 200) {
      recusadas.push(u);
      continue;
    }
    const codigo = andar && numerico ? lido.unidade.padStart(3, '0') : lido.unidade;
    const casa = lido.tipo === 'casa' || lido.tipo === 'lote';
    const nome = `${casa ? 'Quadra' : 'Bloco'} ${lido.bloco}`;
    const lista = porBloco.get(nome) ?? [];
    lista.push({ codigo, pavimento, ordem: lista.length });
    porBloco.set(nome, lista);
  }
  return {
    blocos: [...porBloco.entries()].map(([nome, unidades]) => ({ id: null, nome, unidades })),
    recusadas,
  };
}

/** Um bloco do cadastro do POUP, como `db.unidades.listarBlocos` devolve. */
export interface BlocoExistente {
  id: string;
  nome: string;
  unidades: { codigo: string; pavimento: number; ordem: number }[];
}

export interface BlocoParaGravar {
  id: string | null;
  nome: string;
  unidades: { codigo: string; pavimento: number; ordem: number }[];
}

/**
 * COMPLETAR o cadastro com o que o CV tem — nunca apagar.
 *
 * `salvar_blocos_empreendimento` sincroniza TUDO: bloco que não vai na lista é
 * apagado. Por isso o que sai daqui é o cadastro de hoje inteiro (com os ids,
 * para os blocos não serem recriados), mais os blocos e as unidades do CV que
 * faltam. Bloco e unidade casam pela MESMA chave da tabela de preço
 * ("Bloco 01" = "Bloco 1"; "001" = "1"). A ventilação não vai no pacote: sem a
 * chave `ventilacao_mais`, a RPC mantém a de cada bloco.
 *
 * Devolve também quanto entrou, para a tela mostrar antes de gravar.
 */
export function mesclarBlocos(
  existentes: BlocoExistente[],
  doCv: { nome: string; unidades: { codigo: string; pavimento: number }[] }[],
): { blocos: BlocoParaGravar[]; blocosNovos: number; unidadesNovas: number } {
  const blocos: BlocoParaGravar[] = existentes.map((b) => ({
    id: b.id,
    nome: b.nome,
    unidades: b.unidades.map((u) => ({ codigo: u.codigo, pavimento: u.pavimento, ordem: u.ordem })),
  }));
  const porChave = new Map(blocos.map((b) => [chaveDoBloco(b.nome), b]));
  let blocosNovos = 0;
  let unidadesNovas = 0;

  for (const novo of doCv) {
    let alvo = porChave.get(chaveDoBloco(novo.nome));
    if (!alvo) {
      alvo = { id: null, nome: novo.nome, unidades: [] };
      blocos.push(alvo);
      porChave.set(chaveDoBloco(novo.nome), alvo);
      blocosNovos++;
    }
    const codigos = new Set(alvo.unidades.map((u) => chaveDaUnidade(u.codigo)));
    for (const u of novo.unidades) {
      if (codigos.has(chaveDaUnidade(u.codigo))) continue;
      codigos.add(chaveDaUnidade(u.codigo));
      alvo.unidades.push({ codigo: u.codigo, pavimento: u.pavimento, ordem: alvo.unidades.length });
      unidadesNovas++;
    }
  }
  return { blocos, blocosNovos, unidadesNovas };
}
