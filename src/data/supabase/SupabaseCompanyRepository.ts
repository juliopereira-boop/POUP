import { supabase } from '@/lib/supabase';
import type { CompanyRepository } from '../repositories';
import { type Company, type Result, err, ok } from '../types';
import type { Database } from '../database.types';

type CompanyRow = Database['public']['Tables']['companies']['Row'];

function mapCompany(row: CompanyRow): Company {
  return {
    id: row.id,
    name: row.name,
    risk: row.risk,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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

  async create(
    userId: string,
    data: { name: string; risk: number | null },
  ): Promise<Result<Company>> {
    const { data: row, error } = await supabase
      .from('companies')
      .insert({ user_id: userId, name: data.name, risk: data.risk })
      .select('*')
      .single();
    if (error || !row) return err(error?.message ?? 'Falha ao salvar empresa.');
    return ok(mapCompany(row));
  }

  async update(id: string, data: { name: string; risk: number | null }): Promise<Result<Company>> {
    const { data: row, error } = await supabase
      .from('companies')
      .update({ name: data.name, risk: data.risk, updated_at: new Date().toISOString() })
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
}
