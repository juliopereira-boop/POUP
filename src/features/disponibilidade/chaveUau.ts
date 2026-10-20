/**
 * O VÍNCULO ENTRE A UNIDADE DO UAU E A UNIDADE DO POUP.
 *
 * ===========================================================================
 * A REGRA QUE NÃO PODE QUEBRAR: UNIDADE X COM UNIDADE X
 * ===========================================================================
 * A cor que o corretor vê ("vendida", "disponível") é a de UMA unidade do UAU.
 * Se o vínculo apontar para a unidade vizinha, o corretor oferece um
 * apartamento vendido como disponível — e o erro não aparece em tela nenhuma.
 *
 * Por isso o vínculo é feito UMA vez, aqui, pela mesma chave que a tabela de
 * preço já usa (`../tabelaPreco/chaves.ts`: "BL 02 APTO 001" e
 * "Bloco 2"/"001" viram "2|1"), e GRAVADO pela chave primária do UAU
 * (empresa, produto, número da personalização). Depois de gravado, ninguém
 * mais compara nome: a disponibilidade é lida pela chave.
 *
 * O que este arquivo faz, e o que ele se recusa a fazer:
 *   • casa só quando a chave é IGUAL e única dos dois lados;
 *   • chave repetida em qualquer lado vira conflito, não palpite;
 *   • identificador que não reconhece vira "não reconhecido", não palpite;
 *   • não existe "parecido": não há distância de texto em lugar nenhum.
 *
 * Formatos reais vistos no UAU da Canopus (20/10/2026):
 *   "Bloco 01 Apto 001"   (1/210V, 1/259V, 1/223V, 36/241V)
 *   "Bloco 01 Apto. 005"  (17/02, Gran Village Eusébio)
 *   "Quadra A Casa 01"    (3/236V)
 * ===========================================================================
 */
import { chaveDaUnidade, chaveDoBloco, normalizar } from '../tabelaPreco/chaves';

/** A unidade como o espelho do banco a guarda (`uau_unidades`). */
export interface UnidadeUau {
  empresa: number;
  produto: number;
  numPer: number;
  obra: string;
  identificador: string | null;
  statusCodigo: number | null;
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
  /** Casa e lote são térreos; apartamento tem o andar no código. */
  tipo: 'apartamento' | 'casa' | 'lote' | 'outro';
}

// O prefixo precisa estar no começo ou depois de algo que não é letra: "TR"
// não pode casar dentro de "ENTRADA". As alternativas vão da mais longa para a
// mais curta, senão "BL" ganharia de "BLOCO" e "AP" de "APTO".
const BLOCO = /(?:^|[^A-Z])(BLOCO|BL|TORRE|TR|QUADRA|QD|EDIFICIO|ED)\.?\s*([A-Z0-9]+)/;
const UNIDADE =
  /(?:^|[^A-Z])(APARTAMENTO|APTO|APT|AP|CASA|LOTE|LT|UNIDADE|UND|SALA|LOJA)\.?\s*([A-Z0-9]+(?:-[A-Z0-9]+)?)/;

function tipoDoPrefixo(prefixo: string): IdentificadorLido['tipo'] {
  if (prefixo.startsWith('AP')) return 'apartamento';
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

export function chaveUau(u: Pick<UnidadeUau, 'empresa' | 'produto' | 'numPer'>): string {
  return `${u.empresa}/${u.produto}/${u.numPer}`;
}

export interface Par {
  unitId: string;
  uau: UnidadeUau;
}

export interface Sugestao {
  /** Chave igual e única dos dois lados. Pode ser gravado. */
  casadas: Par[];
  /** Já vinculadas exatamente assim. Nada a fazer. */
  jaVinculadas: Par[];
  /** A unidade do POUP já está vinculada a OUTRA unidade do UAU. Decisão humana. */
  divergentes: { unitId: string; atual: string; sugerida: UnidadeUau }[];
  /** Mesma chave em mais de uma unidade, de um lado ou do outro. */
  conflitos: { chave: string; poup: string[]; uau: UnidadeUau[] }[];
  soNoPoup: UnidadePoup[];
  soNoUau: UnidadeUau[];
  /** Identificador do UAU que este arquivo não sabe ler. */
  naoReconhecidas: UnidadeUau[];
}

/**
 * Sugere os pares. Não grava nada: quem grava é o admin, na tela, pela RPC
 * `uau_salvar_vinculos` — que confere tudo de novo no banco.
 *
 * `existentes`: unitId → chaveUau do vínculo já gravado.
 */
export function sugerirVinculos(
  poup: UnidadePoup[],
  uau: UnidadeUau[],
  existentes: Map<string, string> = new Map(),
): Sugestao {
  const s: Sugestao = {
    casadas: [],
    jaVinculadas: [],
    divergentes: [],
    conflitos: [],
    soNoPoup: [],
    soNoUau: [],
    naoReconhecidas: [],
  };

  // Empreendimento de um bloco só, com o UAU sem bloco no identificador
  // ("Casa 12"): o bloco é o único que existe. Com dois blocos ou mais, não
  // há como saber, e a unidade fica "não reconhecida".
  const blocosPoup = [...new Set(poup.map((p) => p.bloco))];
  const blocoUnico = blocosPoup.length === 1 ? blocosPoup[0] : null;

  const porChavePoup = new Map<string, UnidadePoup[]>();
  for (const p of poup) {
    const k = `${chaveDoBloco(p.bloco)}|${chaveDaUnidade(p.codigo)}`;
    porChavePoup.set(k, [...(porChavePoup.get(k) ?? []), p]);
  }

  const porChaveUau = new Map<string, UnidadeUau[]>();
  for (const u of uau) {
    const lido = lerIdentificador(u.identificador);
    const k = lido ? chaveDoIdentificador(lido, blocoUnico) : null;
    if (!k) {
      s.naoReconhecidas.push(u);
      continue;
    }
    porChaveUau.set(k, [...(porChaveUau.get(k) ?? []), u]);
  }

  for (const [k, lista] of porChaveUau) {
    const doPoup = porChavePoup.get(k) ?? [];
    if (lista.length > 1 || doPoup.length > 1) {
      s.conflitos.push({ chave: k, poup: doPoup.map((p) => p.id), uau: lista });
      continue;
    }
    if (doPoup.length === 0) {
      s.soNoUau.push(lista[0]);
      continue;
    }
    const par = { unitId: doPoup[0].id, uau: lista[0] };
    const atual = existentes.get(par.unitId);
    if (atual === undefined) s.casadas.push(par);
    else if (atual === chaveUau(par.uau)) s.jaVinculadas.push(par);
    else s.divergentes.push({ unitId: par.unitId, atual, sugerida: par.uau });
  }

  for (const [k, lista] of porChavePoup) {
    if (porChaveUau.has(k)) continue;
    // Repetida só do lado do POUP: também é conflito, para o admin ver os dois
    // blocos que normalizam igual ("Bloco 1" e "Bloco 01").
    if (lista.length > 1) s.conflitos.push({ chave: k, poup: lista.map((p) => p.id), uau: [] });
    else s.soNoPoup.push(lista[0]);
  }

  return s;
}

/**
 * O identificador do UAU mudou desde o vínculo? (renumeração no ERP)
 *
 * Mudou = o vínculo deixa de valer até o admin confirmar de novo. O banco faz
 * a mesma conferência (`uau_recalcular_disponibilidade`) e, na dúvida, a
 * unidade fica sem cor — nunca com a cor de outra.
 */
export function identificadorMudou(noVinculo: string, atual: string | null): boolean {
  return normalizar(noVinculo).replace(/\s+/g, ' ').trim() !== normalizar(atual ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * A forma dos blocos a partir do UAU, para o empreendimento que ainda não tem
 * blocos cadastrados. Sai no formato de `salvar_blocos_empreendimento`.
 *
 * Apartamento: o andar está no código (convenção do gerador do POUP —
 * "001" térreo, "101" 1º andar, "1001" 10º andar), então pavimento =
 * andar + 1. Casa e lote: térreo. O código é o do UAU, sem mexer: é ele que o
 * corretor vê no ERP e na tabela da construtora.
 */
export function blocosDoUau(
  uau: UnidadeUau[],
): { blocos: { id: null; nome: string; unidades: { codigo: string; pavimento: number; ordem: number }[] }[]; recusadas: UnidadeUau[] } {
  const porBloco = new Map<string, { codigo: string; pavimento: number; ordem: number }[]>();
  const recusadas: UnidadeUau[] = [];
  for (const u of [...uau].sort((a, b) => a.numPer - b.numPer)) {
    const lido = lerIdentificador(u.identificador);
    if (!lido || lido.bloco == null) {
      recusadas.push(u);
      continue;
    }
    const n = Number.parseInt(lido.unidade, 10);
    const pavimento =
      lido.tipo === 'apartamento' && /^\d+$/.test(lido.unidade) ? Math.floor(n / 100) + 1 : 1;
    if (pavimento < 1 || pavimento > 200) {
      recusadas.push(u);
      continue;
    }
    const nome = /^\d+$/.test(lido.bloco) ? `Bloco ${lido.bloco}` : `${lido.tipo === 'casa' || lido.tipo === 'lote' ? 'Quadra' : 'Bloco'} ${lido.bloco}`;
    const lista = porBloco.get(nome) ?? [];
    lista.push({ codigo: lido.unidade, pavimento, ordem: lista.length });
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
 * COMPLETAR o cadastro com o que o UAU tem — nunca apagar.
 *
 * `salvar_blocos_empreendimento` sincroniza TUDO: bloco que não vai na lista é
 * apagado. Por isso o que sai daqui é o cadastro de hoje inteiro (com os ids,
 * para os blocos não serem recriados), mais os blocos e as unidades do UAU que
 * faltam. Bloco e unidade casam pela MESMA chave da tabela de preço
 * ("Bloco 01" = "Bloco 1"; "001" = "1"). A ventilação não vai no pacote: sem a
 * chave `ventilacao_mais`, a RPC mantém a de cada bloco.
 *
 * Devolve também quanto entrou, para a tela mostrar antes de gravar.
 */
export function mesclarBlocos(
  existentes: BlocoExistente[],
  doUau: { nome: string; unidades: { codigo: string; pavimento: number }[] }[],
): { blocos: BlocoParaGravar[]; blocosNovos: number; unidadesNovas: number } {
  const blocos: BlocoParaGravar[] = existentes.map((b) => ({
    id: b.id,
    nome: b.nome,
    unidades: b.unidades.map((u) => ({ codigo: u.codigo, pavimento: u.pavimento, ordem: u.ordem })),
  }));
  const porChave = new Map(blocos.map((b) => [chaveDoBloco(b.nome), b]));
  let blocosNovos = 0;
  let unidadesNovas = 0;

  for (const novo of doUau) {
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
