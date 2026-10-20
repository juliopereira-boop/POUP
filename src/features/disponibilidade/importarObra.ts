/**
 * IMPORTAR UMA OBRA DO UAU: EMPREENDIMENTO, BLOCOS, UNIDADES, VÍNCULO E PREÇO.
 *
 * O admin escolhe a obra na lista do UAU, confere a prévia e toca em
 * "Importar". A partir daí, numa sequência só:
 *
 *   1. o empreendimento: cria um novo no catálogo, ou usa um que já existe;
 *   2. vincula a obra do UAU a ele (`uau_salvar_obra`);
 *   3. COMPLETA o cadastro de blocos e unidades com o que o UAU tem — nunca
 *      apaga nem renomeia o que já existe (`mesclarBlocos`);
 *   4. grava os vínculos que casaram EXATAMENTE (mesma chave, única dos dois
 *      lados). O resto fica para a conferência, à mão — nunca por "parecido";
 *   5. grava a fonte do preço escolhida (automático / tabela / UAU).
 *
 * A disponibilidade passa a aparecer na hora: o banco pinta cada unidade ao
 * gravar o vínculo. Sem tela aqui: as dependências entram por parâmetro, e o
 * teste (`scripts/testar-disponibilidade.mjs`) roda a sequência com o banco
 * simulado.
 */
import type {
  BlocoParaSalvar,
  ConferenciaUau,
  Development,
  DevelopmentBlock,
  DevelopmentInput,
  FonteDoPreco,
  PreviaDaObra,
  Result,
  VinculoParaGravar,
} from '@/data/types';
import { blocosDoUau, mesclarBlocos, sugerirVinculos, type Sugestao, type UnidadeUau } from './chaveUau';

/** O pedaço do `db` que a importação usa. */
export interface DependenciasDaImportacao {
  criarEmpreendimento(userId: string, dados: DevelopmentInput): Promise<Result<Development>>;
  salvarObra(developmentId: string, empresa: number, obra: string): Promise<Result<void>>;
  listarBlocos(developmentId: string): Promise<{ ok: true; data: DevelopmentBlock[] } | { ok: false; error: string }>;
  salvarBlocos(developmentId: string, blocos: BlocoParaSalvar[]): Promise<Result<unknown>>;
  conferencia(developmentId: string): Promise<Result<ConferenciaUau>>;
  salvarVinculos(developmentId: string, vinculos: VinculoParaGravar[]): Promise<Result<{ gravados: number }>>;
  definirFontePreco(developmentId: string, fonte: FonteDoPreco): Promise<Result<void>>;
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
  pendentes: Pick<Sugestao, 'divergentes' | 'conflitos' | 'soNoPoup' | 'soNoUau' | 'naoReconhecidas'>;
  /** Unidades do UAU sem bloco/quadra legível: não viram cadastro sozinhas. */
  recusadas: number;
}

/** A unidade da prévia no formato do vínculo. */
export function unidadesDaPrevia(p: PreviaDaObra): UnidadeUau[] {
  return p.lista.map((u) => ({
    empresa: p.empresa,
    produto: u.produto,
    numPer: u.numPer,
    obra: p.obra,
    identificador: u.identificador,
    statusCodigo: u.status,
  }));
}

/** O que a conferência do banco tem, no formato do vínculo. */
export function sugestaoDaConferencia(c: ConferenciaUau): Sugestao {
  const existentes = new Map(c.vinculos.map((v) => [v.unitId, v.chave]));
  return sugerirVinculos(
    c.poup.map((p) => ({ id: p.id, bloco: p.bloco, codigo: p.codigo })),
    c.uau
      .filter((u) => !u.ausente)
      .map((u) => ({
        empresa: u.empresa,
        produto: u.produto,
        numPer: u.numPer,
        obra: u.obra,
        identificador: u.identificador,
        statusCodigo: u.statusCodigo,
      })),
    existentes,
  );
}

/** "2028-09-28" → "2028-09-01" (o cadastro guarda mês/ano). */
function mesDaEntrega(iso: string | null): string | null {
  const m = /^(\d{4})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[1]}-${m[2]}-01` : null;
}

export async function importarObra(
  args: { userId: string; previa: PreviaDaObra; destino: DestinoDaImportacao; fonte: FonteDoPreco },
  deps: DependenciasDaImportacao,
  aoPasso: (texto: string) => void = () => {},
): Promise<Result<ResultadoDaImportacao>> {
  const { previa, destino } = args;
  if (previa.lista.length === 0) return { ok: false, error: 'O UAU não devolveu nenhuma unidade para esta obra.' };

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
      deliveryDate: mesDaEntrega(previa.entregaChaves),
      managerName: null,
      uf: destino.uf,
      unitValueFrom: previa.valorMin,
    });
    if (!r.ok) return r;
    developmentId = r.data.id;
  } else {
    developmentId = destino.developmentId;
  }

  // 2. A obra.
  aoPasso('Vinculando a obra do UAU...');
  const obra = await deps.salvarObra(developmentId, previa.empresa, previa.obra);
  if (!obra.ok) return obra;

  // 3. Blocos e unidades: completar, nunca apagar.
  aoPasso('Conferindo blocos e unidades...');
  const lidos = await deps.listarBlocos(developmentId);
  if (!lidos.ok) return { ok: false, error: lidos.error };
  const doUau = blocosDoUau(unidadesDaPrevia(previa));
  const mescla = mesclarBlocos(
    lidos.data.map((b) => ({ id: b.id, nome: b.nome, unidades: b.unidades })),
    doUau.blocos,
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
  const origem: VinculoParaGravar['origem'] = criou || mescla.unidadesNovas > 0 ? 'criado_do_uau' : 'automatico';
  if (s.casadas.length > 0) {
    const g = await deps.salvarVinculos(
      developmentId,
      s.casadas.map((p) => ({ unitId: p.unitId, empresa: p.uau.empresa, produto: p.uau.produto, numPer: p.uau.numPer, origem })),
    );
    if (!g.ok) return g;
  }

  // 5. A fonte do preço.
  if (args.fonte !== 'automatico') {
    const f = await deps.definirFontePreco(developmentId, args.fonte);
    if (!f.ok) return f;
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
        soNoUau: s.soNoUau,
        naoReconhecidas: s.naoReconhecidas,
      },
      recusadas: doUau.recusadas.length,
    },
  };
}

