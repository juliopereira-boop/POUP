/**
 * O RANKING: a lista, a situação das vendas do corretor, a participação, a
 * denúncia, o comprovante de cada venda e a auditoria.
 *
 * Tudo passa por funções do banco (`20260925150000_ranking.sql`) que devolvem
 * só o agregado — o aplicativo nunca lê as vendas dos outros corretores.
 *
 * O comprovante tem leitura própria, e não entra na leitura de vendas de
 * sempre: se a migration ainda não rodou, pedir a coluna nova quebraria a tela
 * de Vendas inteira. Aqui, falta de migration vira aviso.
 */
import type { PickedFile } from '@/features/files/pick';
import type { Escopo, LinhaDoRanking, Periodo, SituacaoDaVenda } from '@/features/ranking/regras';
import { supabase } from '@/lib/supabase';
import type {
  ComprovanteDaVenda,
  ItemDaAuditoria,
  RankingRepository,
  RankingResultado,
} from '../repositories';
import { type Result, err, ok } from '../types';

const BUCKET = 'comprovantes-venda';

interface ErroPostgrest {
  code?: string;
  message?: string;
}

function migracaoAusente(erro: ErroPostgrest | null): boolean {
  if (!erro) return false;
  if (['PGRST205', 'PGRST202', '42P01', '42883', '42703'].includes(erro.code ?? '')) return true;
  return /schema cache|does not exist|could not find/i.test(erro.message ?? '');
}

const MIGRACAO_PENDENTE =
  'O ranking ainda não foi ativado no servidor. Rode a migration 20260925150000_ranking.sql no SQL Editor do Supabase.';

const MENSAGENS: Record<string, string> = {
  plano_pro: 'Disputar o ranking é para assinantes do plano Pro.',
  perfil_incompleto: 'Complete o perfil (nome, CPF, CRECI, estado e cidade) para entrar no ranking.',
  alvo_invalido: 'Não é possível contestar esta posição.',
  motivo_invalido: 'Conte em poucas palavras o que parece errado (mínimo de 5 letras).',
  denuncia_repetida: 'Você já contestou esta posição. A auditoria está conferindo.',
  denuncias_demais: 'Limite de contestações do dia atingido. Tente amanhã.',
  sem_permissao: 'Só a auditoria do POUP pode fazer isso.',
  decisao_invalida: 'Decisão inválida.',
  venda_inexistente: 'Esta venda não existe mais.',
};

function mensagemDoErro(erro: ErroPostgrest, padrao: string): string {
  const texto = erro.message ?? '';
  for (const [codigo, frase] of Object.entries(MENSAGENS)) {
    if (texto.includes(codigo)) return frase;
  }
  if (migracaoAusente(erro)) return MIGRACAO_PENDENTE;
  return padrao;
}

function numero(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function nomeSeguro(original: string): string {
  const ext = /\.([A-Za-z0-9]{2,5})$/.exec(original)?.[1]?.toLowerCase() ?? 'pdf';
  const base = original
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\.[A-Za-z0-9]{2,5}$/, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'comprovante'}.${ext}`;
}

export class SupabaseRankingRepository implements RankingRepository {
  async listar(escopo: Escopo, periodo: Periodo): Promise<RankingResultado> {
    const { data, error } = await supabase.rpc('ranking', { p_escopo: escopo, p_periodo: periodo });
    if (error) {
      if (migracaoAusente(error)) return { ok: false, error: MIGRACAO_PENDENTE, migracaoPendente: true };
      return { ok: false, error: 'Não foi possível carregar o ranking.', migracaoPendente: false };
    }
    const linhas: LinhaDoRanking[] = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      posicao: numero(r.posicao),
      participante: String(r.participante),
      nome: String(r.nome ?? ''),
      fotoUrl: (r.foto_url as string | null) ?? null,
      imobiliaria: (r.imobiliaria as string | null) ?? null,
      cidade: (r.cidade as string | null) ?? null,
      uf: (r.uf as string | null) ?? null,
      vendas: numero(r.vendas),
      vgv: numero(r.vgv),
      eu: Boolean(r.eu),
    }));
    return { ok: true, data: linhas };
  }

  async minhasSituacoes(periodo: Periodo): Promise<Map<string, SituacaoDaVenda>> {
    const { data, error } = await supabase.rpc('meu_ranking', { p_periodo: periodo });
    const mapa = new Map<string, SituacaoDaVenda>();
    if (error || !data) return mapa;
    for (const r of data as { sale_id: string; situacao: SituacaoDaVenda }[]) mapa.set(r.sale_id, r.situacao);
    return mapa;
  }

  async participar(participar: boolean): Promise<Result<void>> {
    const { error } = await supabase.rpc('participar_do_ranking', { p_participar: participar });
    if (error) return err(mensagemDoErro(error, 'Não foi possível atualizar a participação.'));
    return ok(undefined);
  }

  async denunciar(alvo: string, motivo: string): Promise<Result<void>> {
    const { error } = await supabase.rpc('denunciar_no_ranking', { p_alvo: alvo, p_motivo: motivo.trim() });
    if (error) return err(mensagemDoErro(error, 'Não foi possível enviar a contestação.'));
    return ok(undefined);
  }

  // ---------------------------------------------------------------- comprovante

  async comprovante(saleId: string): Promise<Result<ComprovanteDaVenda | null>> {
    const { data, error } = await supabase
      .from('sales')
      .select('comprovante_path, comprovante_nome, comprovante_enviado_em')
      .eq('id', saleId)
      .maybeSingle();
    if (error) return err(migracaoAusente(error) ? MIGRACAO_PENDENTE : 'Não foi possível ler o comprovante.');
    const r = data as { comprovante_path: string | null; comprovante_nome: string | null; comprovante_enviado_em: string | null } | null;
    if (!r?.comprovante_path) return ok(null);
    return ok({ path: r.comprovante_path, nome: r.comprovante_nome ?? 'comprovante', enviadoEm: r.comprovante_enviado_em });
  }

  async anexarComprovante(
    userId: string,
    saleId: string,
    arquivo: PickedFile,
    anterior?: string,
  ): Promise<Result<ComprovanteDaVenda>> {
    const path = `${userId}/${saleId}/${Date.now()}-${nomeSeguro(arquivo.name)}`;
    const { error: e1 } = await supabase.storage
      .from(BUCKET)
      .upload(path, arquivo.body, { contentType: arquivo.contentType || 'application/pdf', upsert: false });
    if (e1) {
      if (/bucket not found/i.test(e1.message)) return err(MIGRACAO_PENDENTE);
      if (/mime|invalid.*type/i.test(e1.message)) return err('Envie o comprovante em PDF ou foto (JPG, PNG).');
      if (/exceeded|too large|maximum allowed size/i.test(e1.message)) return err('Arquivo grande demais. O limite é 15 MB.');
      return err('Não foi possível enviar o comprovante. Tente de novo.');
    }
    const enviadoEm = new Date().toISOString();
    const { error: e2 } = await supabase
      .from('sales')
      .update({ comprovante_path: path, comprovante_nome: arquivo.name.slice(0, 200), comprovante_enviado_em: enviadoEm })
      .eq('id', saleId);
    if (e2) {
      // O arquivo subiu mas a venda não registrou: tira o arquivo órfão.
      void supabase.storage.from(BUCKET).remove([path]);
      return err(migracaoAusente(e2) ? MIGRACAO_PENDENTE : 'Não foi possível registrar o comprovante na venda.');
    }
    // Trocou: o arquivo anterior já não é o comprovante de nada.
    if (anterior && anterior !== path) void supabase.storage.from(BUCKET).remove([anterior]);
    return ok({ path, nome: arquivo.name, enviadoEm });
  }

  async removerComprovante(saleId: string, path: string): Promise<Result<void>> {
    const { error } = await supabase
      .from('sales')
      .update({ comprovante_path: null, comprovante_nome: null, comprovante_enviado_em: null })
      .eq('id', saleId);
    if (error) return err('Não foi possível remover o comprovante.');
    void supabase.storage.from(BUCKET).remove([path]);
    return ok(undefined);
  }

  async linkDoComprovante(path: string): Promise<string | null> {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  }

  // ---------------------------------------------------------------- auditoria

  async auditoria(periodo: Periodo): Promise<Result<ItemDaAuditoria[]>> {
    const { data, error } = await supabase.rpc('ranking_auditoria', { p_periodo: periodo });
    if (error) return err(mensagemDoErro(error, 'Não foi possível carregar a auditoria.'));
    return ok(
      ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        saleId: String(r.sale_id),
        corretor: String(r.corretor),
        corretorNome: String(r.corretor_nome ?? ''),
        corretorCidade: (r.corretor_cidade as string | null) ?? null,
        corretorUf: (r.corretor_uf as string | null) ?? null,
        cliente: String(r.cliente ?? ''),
        empreendimento: (r.empreendimento as string | null) ?? null,
        bloco: r.bloco == null ? null : numero(r.bloco),
        unidade: (r.unidade as string | null) ?? null,
        valor: numero(r.valor),
        dataVenda: String(r.data_venda ?? ''),
        situacao: String(r.situacao) as SituacaoDaVenda,
        decisao: (r.decisao as 'valida' | 'invalida' | null) ?? null,
        comprovantePath: (r.comprovante_path as string | null) ?? null,
        denuncias: numero(r.denuncias),
        motivos: (r.motivos as string | null) ?? null,
        bloqueado: Boolean(r.bloqueado),
      })),
    );
  }

  async revisar(saleId: string, decisao: 'valida' | 'invalida' | null, motivo?: string): Promise<Result<void>> {
    const { error } = await supabase.rpc('ranking_revisar_venda', {
      p_sale: saleId,
      p_decisao: decisao,
      p_motivo: motivo ?? null,
    });
    if (error) return err(mensagemDoErro(error, 'Não foi possível registrar a decisão.'));
    return ok(undefined);
  }

  async bloquear(userId: string, motivo: string | null): Promise<Result<void>> {
    const { error } = await supabase.rpc('ranking_bloquear', { p_user: userId, p_motivo: motivo });
    if (error) return err(mensagemDoErro(error, 'Não foi possível atualizar o bloqueio.'));
    return ok(undefined);
  }

  async arquivarDenuncias(userId: string): Promise<Result<void>> {
    const { error } = await supabase.rpc('ranking_arquivar_denuncias', { p_user: userId });
    if (error) return err(mensagemDoErro(error, 'Não foi possível arquivar as contestações.'));
    return ok(undefined);
  }
}
