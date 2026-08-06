import { supabase } from '@/lib/supabase';
import {
  DEVELOPMENT_SELECT,
  mapDevelopment,
  type DevelopmentJoinRow,
} from './developmentRow';
import { describeCommissionRule } from '@/features/comissao/summary';
import type { CatalogRepository } from '../repositories';
import {
  type CatalogCompany,
  type CatalogPhotoKind,
  type Company,
  type CompanyInput,
  type Development,
  type Result,
  err,
  ok,
} from '../types';
import type { Database } from '../database.types';

type CompanyRow = Database['public']['Tables']['companies']['Row'];

/** Bucket PÚBLICO das fotos redondas do catálogo. */
const PHOTO_BUCKET = 'catalog';

/** Quantos nomes de empreendimento vão na prévia do aviso de aceite. */
const PREVIEW_NAMES = 4;

/** Extensões que o app aceita para a foto — usadas também para limpar a antiga. */
const PHOTO_EXTS = ['jpg', 'png', 'webp'] as const;

/** Pasta no bucket e tabela do banco, por tipo de foto. */
const PHOTO_TARGET: Record<
  CatalogPhotoKind,
  { folder: string; table: 'companies' | 'developments' }
> = {
  company: { folder: 'companies', table: 'companies' },
  development: { folder: 'developments', table: 'developments' },
};

function photoExt(contentType: string): string {
  const type = contentType.toLowerCase();
  if (type.includes('png')) return 'png';
  if (type.includes('webp')) return 'webp';
  return 'jpg';
}

function photoPath(kind: CatalogPhotoKind, id: string, ext: string): string {
  return `${PHOTO_TARGET[kind].folder}/${id}.${ext}`;
}

/** O PostgREST devolve `numeric` como string — converte sem inventar valor. */
function toNumber(value: number | string | null): number | null {
  if (value === null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function mapCatalogCompanyRow(row: CompanyRow): Company {
  return {
    id: row.id,
    name: row.name,
    risk: toNumber(row.risk),
    maxInstallments: toNumber(row.max_installments),
    maxSemiannual: toNumber(row.max_semiannual),
    maxAnnual: toNumber(row.max_annual),
    coincideInstallments: row.coincide_installments,
    photoUrl: row.photo_url,
    isCatalog: row.is_catalog,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * As empresas do catálogo que este corretor adotou.
 *
 * Fica aqui (e não em cada repositório) porque é a MESMA pergunta que as listas
 * de empresas e de empreendimentos fazem para montar a união: o vínculo é a
 * única fonte da verdade sobre o que entrou na conta do corretor.
 */
export async function fetchAdoptedCompanyIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('company_adoptions')
    .select('company_id')
    .eq('user_id', userId);
  if (error || !data) return [];
  return data.map((r) => r.company_id);
}

export class SupabaseCatalogRepository implements CatalogRepository {
  async list(userId: string): Promise<CatalogCompany[]> {
    const { data: rows, error } = await supabase
      .from('companies')
      .select('*')
      .eq('is_catalog', true)
      .order('name', { ascending: true });
    if (error || !rows || rows.length === 0) return [];

    const companies = rows.map(mapCatalogCompanyRow);
    const ids = companies.map((c) => c.id);

    // Prévia, resumo da regra e adoções em paralelo: são três perguntas
    // independentes sobre as mesmas empresas.
    const [devs, rules, adopted] = await Promise.all([
      supabase
        .from('developments')
        .select('company_id, name')
        .in('company_id', ids)
        .order('name', { ascending: true }),
      supabase
        .from('commission_rules')
        .select('company_id, default_pct, installments_count')
        .in('company_id', ids),
      fetchAdoptedCompanyIds(userId),
    ]);

    const names = new Map<string, string[]>();
    for (const d of devs.data ?? []) {
      const list = names.get(d.company_id) ?? [];
      list.push(d.name);
      names.set(d.company_id, list);
    }

    const summaries = new Map<string, string>();
    for (const r of rules.data ?? []) {
      const defaultPct = toNumber(r.default_pct);
      const installmentsCount = toNumber(r.installments_count);
      if (defaultPct == null || installmentsCount == null) continue;
      summaries.set(r.company_id, describeCommissionRule({ defaultPct, installmentsCount }));
    }

    const adoptedSet = new Set(adopted);

    return companies.map((company) => {
      const all = names.get(company.id) ?? [];
      return {
        company,
        developmentCount: all.length,
        developmentNames: all.slice(0, PREVIEW_NAMES),
        commissionSummary: summaries.get(company.id) ?? null,
        adopted: adoptedSet.has(company.id),
      };
    });
  }

  async adopt(userId: string, companyId: string): Promise<Result<void>> {
    // `ignoreDuplicates` deixa o adotar idempotente: clicar duas vezes (ou a
    // tela reenviar) não pode virar erro nem linha repetida.
    const { error } = await supabase
      .from('company_adoptions')
      .upsert(
        { user_id: userId, company_id: companyId },
        { onConflict: 'user_id,company_id', ignoreDuplicates: true },
      );
    if (error) return err(error.message);
    return ok(undefined);
  }

  async unadopt(userId: string, companyId: string): Promise<Result<void>> {
    // Só o vínculo morre: a empresa do catálogo continua lá, e as simulações,
    // vendas e comissões do corretor já têm os valores em snapshot.
    const { error } = await supabase
      .from('company_adoptions')
      .delete()
      .eq('user_id', userId)
      .eq('company_id', companyId);
    if (error) return err(error.message);
    return ok(undefined);
  }

  async listCompanies(): Promise<Company[]> {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('is_catalog', true)
      .order('name', { ascending: true });
    if (error || !data) return [];
    return data.map(mapCatalogCompanyRow);
  }

  /**
   * Os empreendimentos de uma empresa do catálogo, para o painel do admin.
   *
   * Não dá para reaproveitar `db.developments.list`: aquela é a visão do
   * CORRETOR e descarta empreendimento de empresa do catálogo não adotada. O
   * admin edita o catálogo sem adotá-lo, então precisa ler por `company_id`.
   * A RLS já autoriza (`is_catalog_company`); o filtro que estorvava era do app.
   */
  async listDevelopments(companyId: string): Promise<Development[]> {
    const { data, error } = await supabase
      .from('developments')
      .select(DEVELOPMENT_SELECT)
      .eq('company_id', companyId)
      .order('name', { ascending: true });
    if (error || !data) return [];
    return (data as unknown as DevelopmentJoinRow[]).map(mapDevelopment);
  }

  async createCompany(userId: string, data: CompanyInput): Promise<Result<Company>> {
    const { data: row, error } = await supabase
      .from('companies')
      .insert({
        user_id: userId,
        name: data.name,
        risk: data.risk,
        max_installments: data.maxInstallments,
        max_semiannual: data.maxSemiannual,
        max_annual: data.maxAnnual,
        coincide_installments: data.coincideInstallments,
        // O que faz a empresa ser do catálogo. Quem pode gravar `true` é
        // decidido pelo RLS (`is_app_admin()`), não por esta linha.
        is_catalog: true,
      })
      .select('*')
      .single();
    if (error || !row) return err(error?.message ?? 'Falha ao salvar empresa do catálogo.');
    return ok(mapCatalogCompanyRow(row));
  }

  async uploadPhoto(
    kind: CatalogPhotoKind,
    id: string,
    data: Blob,
    contentType: string,
  ): Promise<Result<string>> {
    const ext = photoExt(contentType);
    const path = photoPath(kind, id, ext);

    const { error: upErr } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, data, { contentType, upsert: true });
    if (upErr) return err(upErr.message);

    // Trocar de JPG para PNG deixaria o arquivo antigo órfão no bucket (e a URL
    // velha ainda respondendo). Apaga as outras extensões do mesmo id.
    const stale = PHOTO_EXTS.filter((e) => e !== ext).map((e) => photoPath(kind, id, e));
    await supabase.storage.from(PHOTO_BUCKET).remove(stale);

    const { publicUrl } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data;
    // Cache-buster: o caminho é fixo (`companies/<id>.jpg`), então navegador e
    // CDN continuariam servindo a foto antiga depois de substituir o arquivo.
    // Gravar a URL já versionada é o que faz a troca aparecer na hora.
    const url = `${publicUrl}?v=${Date.now()}`;

    const { error: dbErr } = await supabase
      .from(PHOTO_TARGET[kind].table)
      .update({ photo_url: url, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (dbErr) return err(dbErr.message);

    return ok(url);
  }

  async removePhoto(kind: CatalogPhotoKind, id: string): Promise<Result<void>> {
    // Remove todas as extensões possíveis: não se sabe com qual a foto subiu.
    await supabase.storage.from(PHOTO_BUCKET).remove(PHOTO_EXTS.map((e) => photoPath(kind, id, e)));

    const { error } = await supabase
      .from(PHOTO_TARGET[kind].table)
      .update({ photo_url: null, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return err(error.message);
    return ok(undefined);
  }
}
