/**
 * DISPONIBILIDADE DAS UNIDADES, VINDA DO CV CRM — E O VÍNCULO DO ADMIN.
 *
 * Cada construtora tem a SUA conta do CV (url, e-mail e token). O admin do
 * POUP integra no cadastro da empresa; o token vai direto para o Vault pela
 * Edge Function e nunca volta para o aplicativo.
 *
 * O POUP só LÊ o CV. Quem fala com ele são as Edge Functions
 * `cvcrm-disponibilidade` (o app: integração, empreendimentos, prévia,
 * atualizar, conferir) e `cvcrm-disponibilidade-sync` (o cron), só com GET
 * numa lista fechada de caminhos (`scripts/testar-cvcrm-somente-leitura.mjs`).
 * Daqui saem só RPCs do banco e chamadas a essas funções.
 *
 * Sem a migration `20261026120000_disponibilidade_cvcrm.sql`, a leitura do
 * corretor devolve "sem disponibilidade" em silêncio: a grade fica exatamente
 * como era, e o simulador segue funcionando.
 */
import type { CondicaoDaReserva, ParteDaReserva } from '@/features/disponibilidade/condicoesDaReserva';
import { supabase } from '@/lib/supabase';
import { mensagemDoErro as mensagemDaFuncao } from '@/lib/edgeError';
import type { Json } from '../database.types';
import type { DisponibilidadeRepository } from '../repositories';
import {
  type ConferenciaCv,
  type ContaDoCv,
  type Disponibilidade,
  type DisponibilidadeDaUnidade,
  type EmpreendimentoDoCv,
  type IntegracaoCv,
  type PainelCv,
  type PreparoDaReserva,
  type ReservaDaSimulacao,
  type PreviaDoCv,
  type Result,
  type SituacaoDaUnidade,
  type UnidadeDoCv,
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
  'A disponibilidade do CV ainda não foi ativada no servidor. Rode a migration ' +
  '20261026120000_disponibilidade_cvcrm.sql no SQL Editor do Supabase.';

/** As RPCs falam por código; a frase pertence ao aplicativo. */
const MENSAGENS: Record<string, string> = {
  sem_permissao: 'Só o administrador do POUP vincula o CV.',
  sem_integracao: 'Esta construtora ainda não tem o CV integrado. Integre no Catálogo do sistema, no cadastro da construtora.',
  url_invalida: 'Endereço do CV inválido. Use o endereço da conta da construtora no CV.',
  email_invalido: 'Informe o e-mail do usuário de integração do CV.',
  token_obrigatorio: 'Informe o token do usuário de integração do CV.',
  empresa_invalida: 'Construtora não encontrada.',
  cron_nao_configurado: 'A leitura automática do CV não está configurada no servidor.',
  tabela_invalida: 'Tabela de preço do CV inválida.',
  serie_invalida: 'Série do CV inválida.',
  empreendimento_invalido: 'Empreendimento do CV inválido.',
  empreendimento_de_outro: 'Este empreendimento (ou etapa) do CV já está vinculado a outro empreendimento do POUP.',
  vinculo_invalido: 'Alguma unidade não é deste empreendimento ou não é do CV vinculado a ele. Atualize a conferência.',
  vinculo_repetido: 'A mesma unidade apareceu duas vezes. Revise os pares.',
  unidade_cv_ja_vinculada: 'Uma dessas unidades do CV já está vinculada a outra unidade do POUP.',
  situacao_invalida: 'Classificação de situação inválida.',
  situacao_desconhecida: 'Classificação de situação inválida.',
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
const numero = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

function unidadeDoCv(u: Record<string, unknown>): UnidadeDoCv {
  return {
    cvUnidade: Number(u.cvUnidade),
    etapa: numero(u.etapa),
    bloco: texto(u.bloco),
    nome: texto(u.nome),
    identificador: texto(u.identificador),
    situacao: texto(u.situacao),
  };
}

const SITUACOES_DA_CONTA: IntegracaoCv['situacao'][] = ['pendente', 'ok', 'erro'];

function integracaoCv(i: Record<string, unknown>): IntegracaoCv {
  return {
    companyId: String(i.companyId ?? ''),
    url: texto(i.url),
    email: texto(i.email),
    temToken: Boolean(i.temToken),
    ativo: Boolean(i.ativo),
    situacao: SITUACOES_DA_CONTA.includes(i.situacao as IntegracaoCv['situacao'])
      ? (i.situacao as IntegracaoCv['situacao'])
      : 'pendente',
    ultimoTesteEm: texto(i.ultimoTesteEm),
    ultimoErro: texto(i.ultimoErro),
    ultimoErroEm: texto(i.ultimoErroEm),
    ultimaLeveEm: texto(i.ultimaLeveEm),
    reservaHabilitada: Boolean(i.reservaHabilitada),
    tabelaPrecoCv: Boolean(i.tabelaPrecoCv),
    corretores: Number(i.corretores ?? 0),
    corretoresLidosEm: texto(i.corretoresLidosEm),
    corretoresErro: texto(i.corretoresErro),
    tabelaLidaEm: texto(i.tabelaLidaEm),
    tabelaErro: texto(i.tabelaErro),
    series: ((i.series as Record<string, unknown>[]) ?? []).map((s) => ({ id: Number(s.id), nome: String(s.nome ?? '') })),
    seriesReserva: (i.seriesReserva as IntegracaoCv['seriesReserva']) ?? {},
    empreendimentos: Number(i.empreendimentos ?? 0),
  };
}

function preparoDaReserva(d: Record<string, unknown> | null | undefined): PreparoDaReserva {
  const o = d ?? {};
  return {
    empreendimento: texto(o.empreendimento),
    unidade: (o.unidade as PreparoDaReserva['unidade']) ?? null,
    corretor: (o.corretor as PreparoDaReserva['corretor']) ?? null,
    cliente: (o.cliente as PreparoDaReserva['cliente']) ?? null,
    condicoes: (o.condicoes as PreparoDaReserva['condicoes']) ?? [],
    pendencias: Array.isArray(o.pendencias) ? o.pendencias.map(String) : [],
    cvReserva: numero(o.cvReserva),
  };
}

/** A função da reserva: o corpo da resposta vale também no erro (traz as pendências). */
async function invocarReserva(corpo: Record<string, unknown>, padrao: string): Promise<Result<PreparoDaReserva>> {
  const { data, error } = await supabase.functions.invoke('cvcrm-reserva', { body: corpo });
  if (error) return err(await mensagemDaFuncao(error, padrao));
  const d = data as Record<string, unknown> | null;
  if (d && typeof d.error === 'string') return err(d.error);
  return ok(preparoDaReserva(d));
}

/** O token só vai se foi digitado: vazio = a função mantém o que está no Vault. */
function corpoDaConta(c: ContaDoCv): Record<string, string> {
  const token = c.token.trim();
  return { url: c.url.trim(), email: c.email.trim(), ...(token ? { token } : {}) };
}

/** Um canal por tela: dois ganchos no mesmo empreendimento não brigam pelo mesmo nome. */
let canais = 0;

async function invocar<T>(corpo: Record<string, unknown>, padrao: string): Promise<Result<T>> {
  const { data, error } = await supabase.functions.invoke('cvcrm-disponibilidade', { body: corpo });
  if (error) return err(await mensagemDaFuncao(error, padrao));
  const d = data as { error?: string } | null;
  if (d && typeof d === 'object' && typeof d.error === 'string') return err(d.error);
  return ok(data as T);
}

export class SupabaseDisponibilidadeRepository implements DisponibilidadeRepository {
  async carregar(developmentId: string): Promise<Result<Disponibilidade>> {
    const { data, error } = await supabase.rpc('disponibilidade_do_empreendimento', { p_development: developmentId });
    if (error) {
      // Sem a migration: "sem disponibilidade", e a grade fica como sempre foi.
      if (migracaoAusente(error)) return ok({ ativa: false, atualizadoEm: null, unidades: new Map() });
      return err(traduzir(error, 'Não foi possível ler a disponibilidade.'));
    }
    const r = (data ?? {}) as {
      ativa?: boolean;
      atualizadoEm?: string | null;
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
      });
    }
    return ok({ ativa: Boolean(r.ativa), atualizadoEm: r.atualizadoEm ?? null, unidades });
  }

  assinar(
    developmentId: string,
    aoMudar: (u: DisponibilidadeDaUnidade) => void,
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
      'Não foi possível conferir a unidade no CV agora.',
    );
    if (!r.ok) return r;
    return ok({ situacao: situacao(r.data?.situacao), statusDescricao: r.data?.status_descricao ?? null });
  }

  // ------------------------------------------------------------ admin: a conta do CV

  async integracao(companyId: string): Promise<Result<IntegracaoCv | null>> {
    const { data, error } = await supabase.rpc('cvcrm_integracao', { p_company: companyId });
    if (error) return err(traduzir(error, 'Não foi possível ler a integração com o CV.'));
    return ok(data ? integracaoCv(data as Record<string, unknown>) : null);
  }

  async testarIntegracao(companyId: string, conta?: ContaDoCv): Promise<Result<{ empreendimentos: number | null }>> {
    const r = await invocar<{ empreendimentos?: number | null }>(
      { acao: 'integracao_testar', companyId, ...(conta ? corpoDaConta(conta) : {}) },
      'Não foi possível testar a conta no CV.',
    );
    return r.ok ? ok({ empreendimentos: numero(r.data?.empreendimentos) }) : r;
  }

  async salvarIntegracao(companyId: string, conta: ContaDoCv): Promise<Result<{ empreendimentos: number | null }>> {
    const r = await invocar<{ empreendimentos?: number | null }>(
      { acao: 'integracao_salvar', companyId, ...corpoDaConta(conta) },
      'Não foi possível integrar o CV.',
    );
    return r.ok ? ok({ empreendimentos: numero(r.data?.empreendimentos) }) : r;
  }

  async removerIntegracao(companyId: string): Promise<Result<void>> {
    const { error } = await supabase.rpc('cvcrm_remover_integracao', { p_company: companyId });
    return error ? err(traduzir(error, 'Não foi possível desligar a integração com o CV.')) : ok(undefined);
  }

  async definirRecursos(
    companyId: string,
    recursos: { reserva?: boolean; tabelaPreco?: boolean },
  ): Promise<Result<IntegracaoCv>> {
    const { data, error } = await supabase.rpc('cvcrm_definir_recursos', {
      p_company: companyId,
      p_reserva: recursos.reserva ?? null,
      p_tabela_preco: recursos.tabelaPreco ?? null,
    });
    if (error) return err(traduzir(error, 'Não foi possível mudar a integração com o CV.'));
    return ok(integracaoCv((data ?? {}) as Record<string, unknown>));
  }

  async definirSeries(
    companyId: string,
    mapa: Partial<Record<ParteDaReserva, number | null>>,
  ): Promise<Result<IntegracaoCv>> {
    const { data, error } = await supabase.rpc('cvcrm_definir_series', { p_company: companyId, p_mapa: mapa as Json });
    if (error) return err(traduzir(error, 'Não foi possível salvar as séries da reserva.'));
    return ok(integracaoCv((data ?? {}) as Record<string, unknown>));
  }

  async lerComercialAgora(companyId: string): Promise<Result<void>> {
    const { error } = await supabase.rpc('cvcrm_ler_comercial_agora', { p_company: companyId });
    return error ? err(traduzir(error, 'Não foi possível pedir a leitura ao CV agora.')) : ok(undefined);
  }

  // ------------------------------------------------------------ corretor: a reserva no CV

  async reservaDaSimulacao(simulationId: string): Promise<Result<ReservaDaSimulacao>> {
    const { data, error } = await supabase.rpc('cvcrm_reserva_da_simulacao', { p_simulation: simulationId });
    if (error) {
      // Sem a migration (ou sem permissão): o botão simplesmente não aparece.
      if (migracaoAusente(error)) return ok({ habilitada: false, temVinculo: false, ultima: null });
      return err(traduzir(error, 'Não foi possível ler a reserva desta simulação.'));
    }
    const d = (data ?? {}) as Record<string, unknown>;
    return ok({
      habilitada: Boolean(d.habilitada),
      temVinculo: Boolean(d.temVinculo),
      ultima: (d.ultima as ReservaDaSimulacao['ultima']) ?? null,
    });
  }

  prepararReserva(simulationId: string, condicoes: CondicaoDaReserva[]): Promise<Result<PreparoDaReserva>> {
    return invocarReserva({ acao: 'preparar', simulationId, condicoes }, 'Não foi possível conferir a reserva no CV agora.');
  }

  reservar(simulationId: string, condicoes: CondicaoDaReserva[]): Promise<Result<PreparoDaReserva>> {
    return invocarReserva({ acao: 'reservar', simulationId, condicoes }, 'Não foi possível reservar no CV agora.');
  }

  // ------------------------------------------------------------ admin: empreendimentos

  async empreendimentosDoCv(companyId: string): Promise<Result<EmpreendimentoDoCv[]>> {
    const r = await invocar<{ empreendimentos?: Record<string, unknown>[] }>(
      { acao: 'empreendimentos', companyId },
      'Não foi possível consultar o CV.',
    );
    if (!r.ok) return r;
    return ok(
      (r.data?.empreendimentos ?? []).map((e) => ({
        id: Number(e.id),
        nome: texto(e.nome),
        cidade: texto(e.cidade),
        estado: texto(e.estado),
        dataEntrega: texto(e.dataEntrega),
        unidadesDisponiveis: numero(e.unidadesDisponiveis),
      })),
    );
  }

  async previa(companyId: string, cvEmpreendimento: number): Promise<Result<PreviaDoCv>> {
    const r = await invocar<Record<string, unknown>>(
      { acao: 'previa', companyId, cvEmpreendimento },
      'Não foi possível ler o empreendimento no CV.',
    );
    if (!r.ok) return r;
    const o = r.data ?? {};
    return ok({
      cvEmpreendimento: Number(o.cvEmpreendimento ?? cvEmpreendimento),
      nome: texto(o.nome),
      unidades: Number(o.unidades ?? 0),
      etapas: ((o.etapas as Record<string, unknown>[]) ?? []).map((e) => ({
        id: Number(e.id),
        nome: String(e.nome ?? ''),
        unidades: Number(e.unidades ?? 0),
      })),
      porSituacao: (o.porSituacao as Record<string, number>) ?? {},
      lista: ((o.lista as Record<string, unknown>[]) ?? []).map(unidadeDoCv),
      aviso: typeof o.aviso === 'string' ? o.aviso : undefined,
    });
  }

  async atualizarAgora(developmentId: string): Promise<Result<void>> {
    const r = await invocar({ acao: 'atualizar', developmentId }, 'Não foi possível ler o CV agora.');
    return r.ok ? ok(undefined) : r;
  }

  async painel(): Promise<Result<PainelCv>> {
    const { data, error } = await supabase.rpc('cvcrm_painel');
    if (error) return err(traduzir(error, 'Não foi possível abrir o painel do CV.'));
    const p = (data ?? {}) as Record<string, unknown>;
    return ok({
      ...(p as unknown as PainelCv),
      integracoes: ((p.integracoes as Record<string, unknown>[]) ?? []).map((i) => ({
        ...integracaoCv(i),
        empresa: String(i.empresa ?? ''),
      })),
      empreendimentos: (p.empreendimentos as PainelCv['empreendimentos']) ?? [],
    });
  }

  async conferencia(developmentId: string): Promise<Result<ConferenciaCv>> {
    const { data, error } = await supabase.rpc('cvcrm_conferencia', { p_development: developmentId });
    if (error) return err(traduzir(error, 'Não foi possível montar a conferência.'));
    const c = (data ?? {}) as Record<string, unknown>;
    return ok({
      empreendimentos: (c.empreendimentos as ConferenciaCv['empreendimentos']) ?? [],
      poup: (c.poup as ConferenciaCv['poup']) ?? [],
      cv: ((c.cv as Record<string, unknown>[]) ?? []).map((u) => ({
        ...unidadeDoCv(u),
        empreendimento: Number(u.empreendimento),
        ausente: Boolean(u.ausente),
      })),
      vinculos: (c.vinculos as ConferenciaCv['vinculos']) ?? [],
    });
  }

  async salvarEmpreendimento(
    developmentId: string,
    cv: { empreendimento: number; etapa: number | null; nome: string | null; etapaNome: string | null },
  ): Promise<Result<void>> {
    const { error } = await supabase.rpc('cvcrm_salvar_empreendimento', {
      p_development: developmentId,
      p_cv_empreendimento: cv.empreendimento,
      p_cv_etapa: cv.etapa,
      p_nome: cv.nome,
      p_etapa_nome: cv.etapaNome,
    });
    return error ? err(traduzir(error, 'Não foi possível vincular o empreendimento do CV.')) : ok(undefined);
  }

  async removerEmpreendimento(developmentId: string, cvEmpreendimento: number, cvEtapa: number | null): Promise<Result<void>> {
    const { error } = await supabase.rpc('cvcrm_remover_empreendimento', {
      p_development: developmentId,
      p_cv_empreendimento: cvEmpreendimento,
      p_cv_etapa: cvEtapa,
    });
    return error ? err(traduzir(error, 'Não foi possível desvincular o empreendimento do CV.')) : ok(undefined);
  }

  async salvarVinculos(
    developmentId: string,
    vinculos: VinculoParaGravar[],
    remover: string[] = [],
  ): Promise<Result<{ gravados: number; removidos: number }>> {
    const { data, error } = await supabase.rpc('cvcrm_salvar_vinculos', {
      p_development: developmentId,
      p_vinculos: vinculos as unknown as Json,
      p_remover: remover,
    });
    if (error) return err(traduzir(error, 'Não foi possível gravar os vínculos.'));
    const r = (data ?? {}) as { gravados?: number; removidos?: number };
    return ok({ gravados: Number(r.gravados ?? 0), removidos: Number(r.removidos ?? 0) });
  }

  async classificarSituacao(chave: string, s: Exclude<SituacaoDaUnidade, 'sem_vinculo'>): Promise<Result<void>> {
    const { error } = await supabase.rpc('cvcrm_classificar_situacao', { p_chave: chave, p_situacao: s });
    return error ? err(traduzir(error, 'Não foi possível classificar a situação.')) : ok(undefined);
  }
}
