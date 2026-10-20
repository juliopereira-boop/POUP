/**
 * DISPONIBILIDADE DAS UNIDADES, VINDA DO UAU — E O VÍNCULO DO ADMIN.
 *
 * O POUP só LÊ o UAU. Quem fala com o ERP são as Edge Functions
 * `uau-disponibilidade` (o app: obras, prévia, atualizar, conferir) e
 * `uau-disponibilidade-sync` (o cron), com uma lista fechada de rotas de
 * consulta (`scripts/testar-uau-somente-leitura.mjs`). Daqui saem só RPCs do
 * banco e chamadas a essas funções.
 *
 * Sem a migration `20261020120000_disponibilidade_uau.sql`, a leitura do
 * corretor devolve "sem UAU" em silêncio: a grade fica exatamente como era, e
 * o simulador segue funcionando.
 */
import { supabase } from '@/lib/supabase';
import { mensagemDoErro as mensagemDaFuncao } from '@/lib/edgeError';
import type { Json } from '../database.types';
import type { DisponibilidadeRepository } from '../repositories';
import {
  type ConferenciaUau,
  type Disponibilidade,
  type DisponibilidadeDaUnidade,
  type FonteDoPreco,
  type ObraDoUau,
  type PainelUau,
  type PreviaDaObra,
  type Result,
  type SituacaoDaUnidade,
  type VinculoParaGravar,
  err,
  ok,
} from '../types';

interface ErroPostgrest {
  code?: string;
  message?: string;
}

function migracaoAusente(erro: ErroPostgrest | null): boolean {
  if (!erro) return false;
  if (['PGRST205', 'PGRST202', '42P01', '42883'].includes(erro.code ?? '')) return true;
  return /schema cache|does not exist|could not find/i.test(erro.message ?? '');
}

const MIGRACAO_PENDENTE =
  'A disponibilidade do UAU ainda não foi ativada no servidor. Rode a migration ' +
  '20261020120000_disponibilidade_uau.sql no SQL Editor do Supabase.';

/** As RPCs falam por código; a frase pertence ao aplicativo. */
const MENSAGENS: Record<string, string> = {
  sem_permissao: 'Só o administrador do POUP vincula o UAU.',
  obra_invalida: 'Empresa ou obra do UAU inválida (ex.: empresa 1, obra 259V).',
  obra_de_outro_empreendimento: 'Esta obra do UAU já está vinculada a outro empreendimento.',
  vinculo_invalido: 'Alguma unidade não é deste empreendimento ou não é desta obra do UAU. Atualize a conferência.',
  vinculo_repetido: 'A mesma unidade apareceu duas vezes. Revise os pares.',
  unidade_uau_ja_vinculada: 'Uma dessas unidades do UAU já está vinculada a outra unidade do POUP.',
  situacao_invalida: 'Classificação de status inválida.',
  status_desconhecido: 'Classificação de status inválida.',
  fonte_invalida: 'Escolha de onde vem o preço: automático, tabela ou UAU.',
  formato_invalido: 'Os dados chegaram num formato inesperado. Tente de novo.',
};

function traduzir(erro: ErroPostgrest | null, padrao: string): string {
  if (!erro) return padrao;
  if (migracaoAusente(erro)) return MIGRACAO_PENDENTE;
  const texto = erro.message ?? '';
  for (const [codigo, frase] of Object.entries(MENSAGENS)) {
    if (texto.includes(codigo)) return frase;
  }
  if (erro.code === '42501') return MENSAGENS.sem_permissao;
  return texto || padrao;
}

const SITUACOES: SituacaoDaUnidade[] = ['disponivel', 'negociacao', 'vendida', 'indisponivel', 'sem_vinculo'];
const situacao = (v: unknown): SituacaoDaUnidade =>
  SITUACOES.includes(v as SituacaoDaUnidade) ? (v as SituacaoDaUnidade) : 'sem_vinculo';
const fonte = (v: unknown): FonteDoPreco => (v === 'tabela' || v === 'uau' ? v : 'automatico');
const numero = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Um canal por tela: dois ganchos no mesmo empreendimento não brigam pelo mesmo nome. */
let canais = 0;

async function invocar<T>(corpo: Record<string, unknown>, padrao: string): Promise<Result<T>> {
  const { data, error } = await supabase.functions.invoke('uau-disponibilidade', { body: corpo });
  if (error) return err(await mensagemDaFuncao(error, padrao));
  const d = data as { error?: string } | null;
  if (d && typeof d === 'object' && typeof d.error === 'string') return err(d.error);
  return ok(data as T);
}

export class SupabaseDisponibilidadeRepository implements DisponibilidadeRepository {
  async carregar(developmentId: string): Promise<Result<Disponibilidade>> {
    const { data, error } = await supabase.rpc('uau_disponibilidade', { p_development: developmentId });
    if (error) {
      // Sem a migration: "sem UAU", e a grade fica como sempre foi.
      if (migracaoAusente(error)) {
        return ok({ temUau: false, atualizadoEm: null, fontePreco: 'automatico', unidades: new Map() });
      }
      return err(traduzir(error, 'Não foi possível ler a disponibilidade.'));
    }
    const r = (data ?? {}) as {
      temUau?: boolean;
      atualizadoEm?: string | null;
      fontePreco?: string;
      unidades?: Record<string, unknown>[];
    };
    const unidades = new Map<string, DisponibilidadeDaUnidade>();
    for (const u of r.unidades ?? []) {
      const unitId = String(u.unitId ?? '');
      if (!unitId) continue;
      unidades.set(unitId, {
        unitId,
        situacao: situacao(u.situacao),
        statusDescricao: (u.statusDescricao as string | null) ?? null,
        mudouEm: String(u.mudouEm ?? ''),
        valorUau: numero(u.valorUau),
      });
    }
    return ok({
      temUau: Boolean(r.temUau),
      atualizadoEm: r.atualizadoEm ?? null,
      fontePreco: fonte(r.fontePreco),
      unidades,
    });
  }

  assinar(
    developmentId: string,
    aoMudar: (u: Omit<DisponibilidadeDaUnidade, 'valorUau'>) => void,
    aoReconectar: () => void,
  ): () => void {
    const canal = supabase
      .channel(`disponibilidade:${developmentId}:${++canais}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'development_unit_disponibilidade',
          filter: `development_id=eq.${developmentId}`,
        },
        (p) => {
          const n = p.new as Record<string, unknown> | undefined;
          if (!n?.unit_id) return;
          aoMudar({
            unitId: String(n.unit_id),
            situacao: situacao(n.situacao),
            statusDescricao: (n.status_descricao as string | null) ?? null,
            mudouEm: String(n.mudou_em ?? ''),
          });
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') aoReconectar();
      });
    return () => {
      void supabase.removeChannel(canal);
    };
  }

  async conferir(unitId: string): Promise<Result<{ situacao: SituacaoDaUnidade; statusDescricao: string | null }>> {
    const r = await invocar<{ situacao?: string; status_descricao?: string | null }>(
      { acao: 'conferir', unitId },
      'Não foi possível conferir a unidade no UAU agora.',
    );
    if (!r.ok) return r;
    return ok({ situacao: situacao(r.data?.situacao), statusDescricao: r.data?.status_descricao ?? null });
  }

  async empreendimentosComPreco(): Promise<Map<string, FonteDoPreco>> {
    const { data, error } = await supabase.rpc('uau_empreendimentos_com_preco');
    if (error || !data) return new Map();
    return new Map(data.map((d) => [d.development_id, fonte(d.fonte_preco)]));
  }

  // ------------------------------------------------------------ admin

  async obrasDoUau(): Promise<Result<ObraDoUau[]>> {
    const r = await invocar<{ obras?: Record<string, unknown>[] }>({ acao: 'obras' }, 'Não foi possível consultar o UAU.');
    if (!r.ok) return r;
    return ok(
      (r.data?.obras ?? []).map((o) => ({
        empresa: Number(o.empresa),
        obra: String(o.obra),
        produto: numero(o.produto),
        exemplo: (o.exemplo as string | null) ?? null,
      })),
    );
  }

  async previa(empresa: number, obra: string): Promise<Result<PreviaDaObra>> {
    const r = await invocar<{ obras?: Record<string, unknown>[] }>(
      { acao: 'previa', empresa, obra },
      'Não foi possível ler a obra no UAU.',
    );
    if (!r.ok) return r;
    const o = r.data?.obras?.[0];
    if (!o) return err('O UAU não devolveu esta obra.');
    return ok({
      empresa: Number(o.empresa),
      obra: String(o.obra),
      unidades: Number(o.unidades ?? 0),
      porStatus: (o.porStatus as Record<string, number>) ?? {},
      exemplos: (o.exemplos as (string | null)[]) ?? [],
      valorMin: numero(o.valorMin),
      valorMax: numero(o.valorMax),
      entregaChaves: (o.entregaChaves as string | null) ?? null,
      lista: ((o.lista as Record<string, unknown>[]) ?? []).map((u) => ({
        produto: Number(u.produto),
        numPer: Number(u.numPer),
        identificador: (u.identificador as string | null) ?? null,
        status: numero(u.status),
        descricao: (u.descricao as string | null) ?? null,
        valor: numero(u.valor),
      })),
      aviso: typeof o.aviso === 'string' ? o.aviso : undefined,
    });
  }

  async atualizarAgora(developmentId: string): Promise<Result<void>> {
    const r = await invocar({ acao: 'atualizar', developmentId }, 'Não foi possível ler o UAU agora.');
    return r.ok ? ok(undefined) : r;
  }

  async painel(): Promise<Result<PainelUau>> {
    const { data, error } = await supabase.rpc('uau_painel');
    if (error) return err(traduzir(error, 'Não foi possível abrir o painel do UAU.'));
    return ok(data as unknown as PainelUau);
  }

  async conferencia(developmentId: string): Promise<Result<ConferenciaUau>> {
    const { data, error } = await supabase.rpc('uau_conferencia', { p_development: developmentId });
    if (error) return err(traduzir(error, 'Não foi possível montar a conferência.'));
    return ok(data as unknown as ConferenciaUau);
  }

  async salvarObra(developmentId: string, empresa: number, obra: string, ativo = true): Promise<Result<void>> {
    const { error } = await supabase.rpc('uau_salvar_obra', {
      p_development: developmentId,
      p_empresa: empresa,
      p_obra: obra,
      p_ativo: ativo,
    });
    return error ? err(traduzir(error, 'Não foi possível vincular a obra.')) : ok(undefined);
  }

  async removerObra(developmentId: string, empresa: number, obra: string): Promise<Result<void>> {
    const { error } = await supabase.rpc('uau_remover_obra', {
      p_development: developmentId,
      p_empresa: empresa,
      p_obra: obra,
    });
    return error ? err(traduzir(error, 'Não foi possível desvincular a obra.')) : ok(undefined);
  }

  async salvarVinculos(
    developmentId: string,
    vinculos: VinculoParaGravar[],
    remover: string[] = [],
  ): Promise<Result<{ gravados: number; removidos: number }>> {
    const { data, error } = await supabase.rpc('uau_salvar_vinculos', {
      p_development: developmentId,
      p_vinculos: vinculos as unknown as Json,
      p_remover: remover,
    });
    if (error) return err(traduzir(error, 'Não foi possível gravar os vínculos.'));
    const r = (data ?? {}) as { gravados?: number; removidos?: number };
    return ok({ gravados: Number(r.gravados ?? 0), removidos: Number(r.removidos ?? 0) });
  }

  async definirFontePreco(developmentId: string, f: FonteDoPreco): Promise<Result<void>> {
    const { error } = await supabase.rpc('uau_definir_fonte_preco', { p_development: developmentId, p_fonte: f });
    return error ? err(traduzir(error, 'Não foi possível mudar a fonte do preço.')) : ok(undefined);
  }

  async classificarStatus(codigo: number, s: Exclude<SituacaoDaUnidade, 'sem_vinculo'>): Promise<Result<void>> {
    const { error } = await supabase.rpc('uau_classificar_status', { p_codigo: codigo, p_situacao: s });
    return error ? err(traduzir(error, 'Não foi possível classificar o status.')) : ok(undefined);
  }
}
