/**
 * IMPORTAR UM EMPREENDIMENTO DO CV: EMPREENDIMENTO, BLOCOS, UNIDADES E VÍNCULO.
 *
 * O admin escolhe o empreendimento na lista do CV (e a etapa, quando o CV
 * junta módulos num empreendimento só), confere a prévia e toca em
 * "Importar". A partir daí, numa sequência só:
 *
 *   1. o empreendimento: cria um novo no catálogo, ou usa um que já existe;
 *   2. vincula o empreendimento (e a etapa) do CV a ele
 *      (`cvcrm_salvar_empreendimento`);
 *   3. COMPLETA o cadastro de blocos e unidades com o que o CV tem — nunca
 *      apaga nem renomeia o que já existe (`mesclarBlocos`);
 *   4. grava os vínculos que casaram EXATAMENTE (mesma chave, única dos dois
 *      lados). O resto fica para a conferência, à mão — nunca por "parecido".
 *
 * A disponibilidade passa a aparecer na hora: o banco pinta cada unidade ao
 * gravar o vínculo. O preço continua o da tabela de preço enviada (o CV não
 * tem valor de venda por unidade). Sem tela aqui: as dependências entram por
 * parâmetro, e o teste (`scripts/testar-disponibilidade.mjs`) roda a
 * sequência com o banco simulado.
 */
import type {
  BlocoParaSalvar,
  ConferenciaCv,
  Development,
  DevelopmentBlock,
  DevelopmentInput,
  PreviaDoCv,
  Result,
  VinculoParaGravar,
} from '@/data/types';
import { blocosDoCv, mesclarBlocos, sugerirVinculos, type Sugestao, type UnidadeCv } from './vinculo';

/** O pedaço do `db` que a importação usa. */
export interface DependenciasDaImportacao {
  criarEmpreendimento(userId: string, dados: DevelopmentInput): Promise<Result<Development>>;
  salvarEmpreendimento(
    developmentId: string,
    cv: { empreendimento: number; etapa: number | null; nome: string | null; etapaNome: string | null },
  ): Promise<Result<void>>;
  listarBlocos(developmentId: string): Promise<{ ok: true; data: DevelopmentBlock[] } | { ok: false; error: string }>;
  salvarBlocos(developmentId: string, blocos: BlocoParaSalvar[]): Promise<Result<unknown>>;
  conferencia(developmentId: string): Promise<Result<ConferenciaCv>>;
  salvarVinculos(developmentId: string, vinculos: VinculoParaGravar[]): Promise<Result<{ gravados: number }>>;
}

export type DestinoDaImportacao =
  | { tipo: 'novo'; companyId: string; nome: string; uf: string | null }
  | { tipo: 'existente'; developmentId: string };

export interface ResultadoDaImportacao {
  developmentId: string;
  criouEmpreendimento: boolean;
  blocosNovos: number;
  unidadesNovas: number;
  vinculadas: number;
  jaVinculadas: number;
  /** O que ficou para a conferência à mão. */
  pendentes: Pick<Sugestao, 'divergentes' | 'conflitos' | 'soNoPoup' | 'soNoCv' | 'naoReconhecidas'>;
  /** Unidades do CV sem bloco/quadra legível: não viram cadastro sozinhas. */
  recusadas: number;
}

/** As unidades da prévia que entram (a etapa escolhida, ou todas). */
export function unidadesDaPrevia(p: PreviaDoCv, etapa: number | null): UnidadeCv[] {
  return p.lista
    .filter((u) => etapa == null || u.etapa === etapa)
    .map((u) => ({ cvUnidade: u.cvUnidade, identificador: u.identificador, situacao: u.situacao }));
}

/** "2028-09-28" → "2028-09-01" (o cadastro guarda mês/ano). */
function mesDaEntrega(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[1]}-${m[2]}-01` : null;
}

/** O que a conferência do banco tem, no formato do vínculo. */
export function sugestaoDaConferencia(c: ConferenciaCv): Sugestao {
  const existentes = new Map(c.vinculos.map((v) => [v.unitId, v.cvUnidade]));
  return sugerirVinculos(
    c.poup.map((p) => ({ id: p.id, bloco: p.bloco, codigo: p.codigo })),
    c.cv
      .filter((u) => !u.ausente)
      .map((u) => ({ cvUnidade: u.cvUnidade, identificador: u.identificador, situacao: u.situacao })),
    existentes,
  );
}

export async function importarDoCv(
  args: {
    userId: string;
    previa: PreviaDoCv;
    /** A etapa (módulo) do CV que vai para este empreendimento; nula = todas. */
    etapa: number | null;
    destino: DestinoDaImportacao;
    /** AAAA-MM-DD, a entrega que a lista do CV informa (preenche o cadastro novo). */
    dataEntrega?: string | null;
  },
  deps: DependenciasDaImportacao,
  aoPasso: (texto: string) => void = () => {},
): Promise<Result<ResultadoDaImportacao>> {
  const { previa, destino, etapa } = args;
  const unidades = unidadesDaPrevia(previa, etapa);
  if (unidades.length === 0) return { ok: false, error: 'O CV não devolveu nenhuma unidade para este empreendimento.' };

  // 1. O empreendimento.
  let developmentId: string;
  const criou = destino.tipo === 'novo';
  if (destino.tipo === 'novo') {
    if (!destino.nome.trim()) return { ok: false, error: 'Informe o nome do empreendimento.' };
    aoPasso('Criando o empreendimento...');
    const r = await deps.criarEmpreendimento(args.userId, {
      companyId: destino.companyId,
      name: destino.nome.trim(),
      description: null,
      deliveryDate: mesDaEntrega(args.dataEntrega),
      managerName: null,
      uf: destino.uf,
      unitValueFrom: null,
    });
    if (!r.ok) return r;
    developmentId = r.data.id;
  } else {
    developmentId = destino.developmentId;
  }

  // 2. O empreendimento (e a etapa) do CV.
  aoPasso('Vinculando o empreendimento do CV...');
  const vinculo = await deps.salvarEmpreendimento(developmentId, {
    empreendimento: previa.cvEmpreendimento,
    etapa,
    nome: previa.nome,
    etapaNome: etapa == null ? null : (previa.etapas.find((e) => e.id === etapa)?.nome ?? null),
  });
  if (!vinculo.ok) return vinculo;

  // 3. Blocos e unidades: completar, nunca apagar.
  aoPasso('Conferindo blocos e unidades...');
  const lidos = await deps.listarBlocos(developmentId);
  if (!lidos.ok) return { ok: false, error: lidos.error };
  const doCv = blocosDoCv(unidades);
  const mescla = mesclarBlocos(
    lidos.data.map((b) => ({ id: b.id, nome: b.nome, unidades: b.unidades })),
    doCv.blocos,
  );
  if (mescla.unidadesNovas > 0) {
    aoPasso(`Cadastrando ${mescla.unidadesNovas} unidades...`);
    const salvo = await deps.salvarBlocos(developmentId, mescla.blocos);
    if (!salvo.ok) return { ok: false, error: salvo.error };
  }

  // 4. Os vínculos que casaram exatamente.
  aoPasso('Vinculando unidade a unidade...');
  const conf = await deps.conferencia(developmentId);
  if (!conf.ok) return conf;
  const s = sugestaoDaConferencia(conf.data);
  const origem: VinculoParaGravar['origem'] = criou || mescla.unidadesNovas > 0 ? 'criado_do_cv' : 'automatico';
  if (s.casadas.length > 0) {
    const g = await deps.salvarVinculos(
      developmentId,
      s.casadas.map((p) => ({ unitId: p.unitId, cvUnidade: p.cv.cvUnidade, origem })),
    );
    if (!g.ok) return g;
  }

  return {
    ok: true,
    data: {
      developmentId,
      criouEmpreendimento: criou,
      blocosNovos: mescla.blocosNovos,
      unidadesNovas: mescla.unidadesNovas,
      vinculadas: s.casadas.length,
      jaVinculadas: s.jaVinculadas.length,
      pendentes: {
        divergentes: s.divergentes,
        conflitos: s.conflitos,
        soNoPoup: s.soNoPoup,
        soNoCv: s.soNoCv,
        naoReconhecidas: s.naoReconhecidas,
      },
      recusadas: doCv.recusadas.length,
    },
  };
}
