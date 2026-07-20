import { supabase } from '@/lib/supabase';
import type { CompanyRepository } from '../repositories';
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
  async list(userId: string): Promise<Company[]> {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('user_id', userId)
      .order('name', { ascending: true });
    if (error || !data) return [];
    return data.map(mapCompany);
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
