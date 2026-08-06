import { supabase } from '@/lib/supabase';
import type { CompanyRepository } from '../repositories';
import { fetchAdoptedCompanyIds } from './SupabaseCatalogRepository';
import {
  type Company,
  type CompanyInput,
  type Correspondent,
  type Result,
  err,
  ok,
} from '../types';
import type { Database } from '../database.types';

type CompanyRow = Database['public']['Tables']['companies']['Row'];
type CorrespondentRow = Database['public']['Tables']['correspondents']['Row'];

function mapCompany(row: CompanyRow): Company {
  return {
    id: row.id,
    name: row.name,
    risk: row.risk,
    maxInstallments: row.max_installments,
    maxSemiannual: row.max_semiannual,
    maxAnnual: row.max_annual,
    coincideInstallments: row.coincide_installments,
    photoUrl: row.photo_url,
    isCatalog: row.is_catalog,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function companyPayload(data: CompanyInput) {
  return {
    name: data.name,
    risk: data.risk,
    max_installments: data.maxInstallments,
    max_semiannual: data.maxSemiannual,
    max_annual: data.maxAnnual,
    coincide_installments: data.coincideInstallments,
  };
}

export class SupabaseCompanyRepository implements CompanyRepository {
  /**
   * A UNIÃO de duas coisas diferentes: o que o corretor cadastrou e o que ele
   * adotou do catálogo.
   *
   * São duas consultas de propósito. Não dá para resolver com um `or` só, porque
   * as condições são de tabelas diferentes (`companies.user_id` e
   * `company_adoptions.user_id`), e um filtro em tabela embutida NÃO restringe a
   * linha pai no PostgREST — voltariam empresas do catálogo que ninguém adotou.
   *
   * `is_catalog = false` nas próprias: mesmo o admin (dono da linha do catálogo)
   * precisa adotar para usar no simulador, senão o catálogo entraria na conta
   * dele sem consentimento — e apareceria duplicado depois de adotar.
   */
  async list(userId: string): Promise<Company[]> {
    const adoptedIds = await fetchAdoptedCompanyIds(userId);

    const [own, adopted] = await Promise.all([
      supabase
        .from('companies')
        .select('*')
        .eq('user_id', userId)
        .eq('is_catalog', false)
        .order('name', { ascending: true }),
      adoptedIds.length > 0
        ? supabase.from('companies').select('*').in('id', adoptedIds)
        : Promise.resolve({ data: [] as CompanyRow[], error: null }),
    ]);

    // Deduplica por id: o admin pode ter adotado a própria empresa do catálogo,
    // e uma empresa não pode aparecer duas vezes na lista dele.
    const byId = new Map<string, Company>();
    for (const row of own.data ?? []) byId.set(row.id, mapCompany(row));
    for (const row of adopted.data ?? []) byId.set(row.id, mapCompany(row));

    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  async create(userId: string, data: CompanyInput): Promise<Result<Company>> {
    const { data: row, error } = await supabase
      .from('companies')
      .insert({ user_id: userId, ...companyPayload(data) })
      .select('*')
      .single();
    if (error || !row) return err(error?.message ?? 'Falha ao salvar empresa.');
    return ok(mapCompany(row));
  }

  async update(id: string, data: CompanyInput): Promise<Result<Company>> {
    const { data: row, error } = await supabase
      .from('companies')
      .update({ ...companyPayload(data), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error || !row) return err(error?.message ?? 'Falha ao atualizar empresa.');
    return ok(mapCompany(row));
  }

  async remove(id: string): Promise<Result<void>> {
    const { error } = await supabase.from('companies').delete().eq('id', id);
    if (error) return err(error.message);
    return ok(undefined);
  }

  async listCorrespondents(companyId: string): Promise<Correspondent[]> {
    const { data, error } = await supabase
      .from('correspondents')
      .select('*')
      .eq('company_id', companyId)
      .order('name', { ascending: true });
    if (error || !data) return [];
    return data.map((r: CorrespondentRow) => ({
      id: r.id,
      companyId: r.company_id,
      name: r.name,
    }));
  }

  async addCorrespondent(
    userId: string,
    companyId: string,
    name: string,
  ): Promise<Result<Correspondent>> {
    const { data: row, error } = await supabase
      .from('correspondents')
      .insert({ user_id: userId, company_id: companyId, name })
      .select('*')
      .single();
    if (error || !row) return err(error?.message ?? 'Falha ao salvar correspondente.');
    return ok({ id: row.id, companyId: row.company_id, name: row.name });
  }

  async removeCorrespondent(id: string): Promise<Result<void>> {
    const { error } = await supabase.from('correspondents').delete().eq('id', id);
    if (error) return err(error.message);
    return ok(undefined);
  }
}
