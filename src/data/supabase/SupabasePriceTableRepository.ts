/**
 * A TABELA DE PREÇO DE UM EMPREENDIMENTO: as linhas da regra, a lista de
 * vagas e o PDF de onde elas saíram.
 *
 * O banco guarda em snake_case (`area_m2`, `vaga_da_lista`) e o aplicativo usa
 * os tipos de `features/tabelaPreco/preco.ts`; a tradução mora aqui, nos dois
 * sentidos. A leitura é defensiva: uma linha que chegue torta vira "sem
 * preço" na tela, nunca um preço errado nem uma tela quebrada.
 *
 * Ver `supabase/migrations/20260924180000_tabela_de_preco.sql` e a Edge
 * Function `ler-tabela-preco`.
 */
import type { PickedFile } from '@/features/files/pick';
import { mensagemDoErro as mensagemDaFuncao } from '@/lib/edgeError';
import { supabase } from '@/lib/supabase';
import type { PriceTableRepository, TabelaResultado, TextoDoPdf } from '../repositories';
import {
  type ArquivoDaTabela,
  type ListaDeVagas,
  type RegraDePreco,
  type Result,
  type TabelaDePreco,
  type Vaga,
  type Ventilacao,
  err,
  ok,
} from '../types';

const BUCKET = 'tabelas-de-preco';
const FUNCAO = 'ler-tabela-preco';

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
  'A tabela de preço ainda não foi ativada no servidor. Rode a migration ' +
  '20260924180000_tabela_de_preco.sql no SQL Editor do Supabase.';

const MENSAGENS: Record<string, string> = {
  sem_permissao: 'Você não pode alterar a tabela de preço deste empreendimento.',
  formato_invalido: 'A tabela chegou num formato inesperado. Tente de novo.',
  referencia_invalida: 'A referência da tabela pode ter no máximo 60 letras.',
  regras_demais: 'A tabela pode ter no máximo 500 linhas.',
  regra_invalida: 'Uma das linhas da tabela está com valor inválido. Confira andar, posição, vaga e valores.',
  regra_repetida: 'Duas linhas da tabela têm a mesma combinação de andar, posição e vaga.',
  vagas_invalidas: 'A lista de vagas está num formato inesperado.',
  arquivo_invalido: 'O PDF da tabela não pertence a este empreendimento.',
};

function mensagemDoErro(erro: ErroPostgrest): string {
  const texto = erro.message ?? '';
  for (const [codigo, frase] of Object.entries(MENSAGENS)) {
    if (texto.includes(codigo)) return frase;
  }
  if (erro.code === '42501') return MENSAGENS.sem_permissao;
  return texto || 'Não foi possível salvar a tabela de preço.';
}

// ---------------------------------------------------------------- leitura

interface LinhaTabela {
  development_id: string;
  referencia: string | null;
  regras: unknown;
  vagas: unknown;
  arquivo_path: string | null;
  arquivo_nome: string | null;
  atualizado_em: string | null;
}

function numeroOuNulo(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function vagaOuNulo(v: unknown): Vaga | null {
  return v === 'carro' || v === 'moto' ? v : null;
}

function ventilacaoOuNulo(v: unknown): Ventilacao | null {
  return v === 'mais' || v === 'menos' ? v : null;
}

function paraRegras(bruto: unknown): RegraDePreco[] {
  if (!Array.isArray(bruto)) return [];
  const regras: RegraDePreco[] = [];
  for (const item of bruto) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const venda = numeroOuNulo(r.venda);
    if (venda == null || venda <= 0) continue;
    const pav = numeroOuNulo(r.pavimento);
    regras.push({
      pavimento: pav != null && Number.isInteger(pav) && pav >= 1 ? pav : null,
      ventilacao: ventilacaoOuNulo(r.ventilacao),
      vaga: vagaOuNulo(r.vaga),
      areaM2: numeroOuNulo(r.area_m2),
      avaliacao: numeroOuNulo(r.avaliacao),
      venda,
    });
  }
  return regras;
}

function paraVagas(bruto: unknown): ListaDeVagas | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const v = bruto as Record<string, unknown>;
  const vagaDaLista = vagaOuNulo(v.vaga_da_lista);
  if (!vagaDaLista) return null;
  const unidades = Array.isArray(v.unidades)
    ? v.unidades
        .filter((u): u is Record<string, unknown> => Boolean(u) && typeof u === 'object')
        .map((u) => ({ bloco: String(u.bloco ?? ''), unidade: String(u.unidade ?? '') }))
        .filter((u) => u.bloco && u.unidade)
    : [];
  return { vagaDaLista, vagaDasDemais: vagaOuNulo(v.vaga_das_demais), unidades };
}

function paraTabela(l: LinhaTabela): TabelaDePreco {
  return {
    referencia: l.referencia ?? '',
    atualizadoEm: l.atualizado_em,
    regras: paraRegras(l.regras),
    vagas: paraVagas(l.vagas),
    arquivo: l.arquivo_path ? { path: l.arquivo_path, nome: l.arquivo_nome || 'tabela.pdf' } : null,
  };
}

// ---------------------------------------------------------------- escrita

function paraBanco(t: Omit<TabelaDePreco, 'atualizadoEm'>) {
  return {
    referencia: t.referencia.trim(),
    regras: t.regras.map((r) => ({
      pavimento: r.pavimento,
      ventilacao: r.ventilacao,
      vaga: r.vaga,
      area_m2: r.areaM2,
      avaliacao: r.avaliacao,
      venda: r.venda,
    })),
    vagas: t.vagas
      ? {
          vaga_da_lista: t.vagas.vagaDaLista,
          vaga_das_demais: t.vagas.vagaDasDemais,
          unidades: t.vagas.unidades.map((u) => ({ bloco: u.bloco, unidade: u.unidade })),
        }
      : null,
    arquivo: t.arquivo ? { path: t.arquivo.path, nome: t.arquivo.nome } : null,
  };
}

/** Nome seguro para o Storage: sem barra, sem acento, sem espaço sobrando. */
function nomeDoArquivo(original: string): string {
  const base = original
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\.pdf$/i, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80);
  return `${base || 'tabela'}.pdf`;
}

function carimbo(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export class SupabasePriceTableRepository implements PriceTableRepository {
  async carregar(developmentId: string): Promise<TabelaResultado> {
    const { data, error } = await supabase
      .from('development_price_tables')
      .select('development_id, referencia, regras, vagas, arquivo_path, arquivo_nome, atualizado_em')
      .eq('development_id', developmentId)
      .maybeSingle();
    if (error) {
      if (migracaoAusente(error)) return { ok: false, error: MIGRACAO_PENDENTE, migracaoPendente: true };
      return { ok: false, error: 'Não foi possível carregar a tabela de preço.', migracaoPendente: false };
    }
    return { ok: true, data: data ? paraTabela(data as unknown as LinhaTabela) : null };
  }

  async referencias(): Promise<Map<string, string>> {
    // A RLS já filtra: volta só o que o corretor pode ler.
    const { data, error } = await supabase
      .from('development_price_tables')
      .select('development_id, referencia, regras');
    const mapa = new Map<string, string>();
    if (error || !data) return mapa;
    for (const l of data as unknown as { development_id: string; referencia: string | null; regras: unknown }[]) {
      if (Array.isArray(l.regras) && l.regras.length > 0) mapa.set(l.development_id, l.referencia ?? '');
    }
    return mapa;
  }

  async salvar(
    developmentId: string,
    tabela: Omit<TabelaDePreco, 'atualizadoEm'> | null,
  ): Promise<Result<TabelaDePreco | null>> {
    const { error } = await supabase.rpc('salvar_tabela_de_preco', {
      p_development: developmentId,
      p_tabela: tabela ? paraBanco(tabela) : null,
    });
    if (error) {
      if (migracaoAusente(error)) return err(MIGRACAO_PENDENTE);
      return err(mensagemDoErro(error));
    }
    const relida = await this.carregar(developmentId);
    if (!relida.ok) return err(relida.error);
    return ok(relida.data);
  }

  async enviarPdf(developmentId: string, arquivo: PickedFile): Promise<Result<ArquivoDaTabela>> {
    const path = `${developmentId}/${carimbo()}-${nomeDoArquivo(arquivo.name)}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, arquivo.body, { contentType: 'application/pdf', upsert: false });
    if (error) {
      if (/bucket not found/i.test(error.message)) return err(MIGRACAO_PENDENTE);
      if (/row-level security|unauthorized|not allowed/i.test(error.message)) {
        return err('Você não pode enviar a tabela deste empreendimento.');
      }
      if (/exceeded|too large|maximum allowed size/i.test(error.message)) {
        return err('PDF grande demais. O limite é 15 MB.');
      }
      if (/mime|invalid.*type/i.test(error.message)) return err('Envie a tabela em PDF.');
      return err('Não foi possível enviar o PDF. Tente de novo.');
    }
    return ok({ path, nome: arquivo.name.slice(0, 200) });
  }

  async lerPdf(path: string): Promise<Result<TextoDoPdf>> {
    const { data, error } = await supabase.functions.invoke(FUNCAO, { body: { path } });
    if (error) {
      const status = (error as { context?: { status?: number } }).context?.status;
      const padrao =
        status === 404
          ? 'A leitura de PDF ainda não foi ativada no servidor (Edge Function ler-tabela-preco). Enquanto isso, use "Colar o texto".'
          : 'Não foi possível ler o PDF agora. Tente de novo ou use "Colar o texto".';
      return err(await mensagemDaFuncao(error, padrao));
    }
    const r = data as { texto?: unknown; paginas?: unknown; error?: unknown } | null;
    if (typeof r?.error === 'string') return err(r.error);
    if (typeof r?.texto !== 'string') return err('A leitura do PDF voltou vazia.');
    return ok({ texto: r.texto, paginas: Number(r.paginas) || 0 });
  }

  async linkDoPdf(path: string): Promise<string | null> {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  }
}
