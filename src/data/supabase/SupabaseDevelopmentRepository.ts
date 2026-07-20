import { supabase } from '@/lib/supabase';
import type { DevelopmentRepository } from '../repositories';
import { type Development, type Result, err, ok } from '../types';

/** Linha retornada com o join da empresa (para exibir o nome dela na lista). */
interface DevelopmentJoinRow {
  id: string;
  company_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  companies: { name: string } | null;
}

function mapDevelopment(row: DevelopmentJoinRow): Development {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    companyName: row.companies?.name ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SupabaseDevelopmentRepository implements DevelopmentRepository {
  async list(userId: string): Promise<Development[]> {
    const { data, error } = await supabase
      .from('developments')
      .select('id, company_id, name, created_at, updated_at, companies(name)')
      .eq('user_id', userId)
      .order('name', { ascending: true });
    if (error || !data) return [];
    return (data as unknown as DevelopmentJoinRow[]).map(mapDevelopment);
  }

  async create(
    userId: string,
    data: { companyId: string; name: string },
  ): Promise<Result<Development>> {
    const { data: row, error } = await supabase
      .from('developments')
      .insert({ user_id: userId, company_id: data.companyId, name: data.name })
      .select('id, company_id, name, created_at, updated_at, companies(name)')
      .single();
    if (error || !row) return err(error?.message ?? 'Falha ao salvar empreendimento.');
    return ok(mapDevelopment(row as unknown as DevelopmentJoinRow));
  }

  async update(
    id: string,
    data: { companyId: string; name: string },
  ): Promise<Result<Development>> {
    const { data: row, error } = await supabase
      .from('developments')
      .update({ company_id: data.companyId, name: data.name, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, company_id, name, created_at, updated_at, companies(name)')
      .single();
    if (error || !row) return err(error?.message ?? 'Falha ao atualizar empreendimento.');
    return ok(mapDevelopment(row as unknown as DevelopmentJoinRow));
  }

  async remove(id: string): Promise<Result<void>> {
    const { error } = await supabase.from('developments').delete().eq('id', id);
    if (error) return err(error.message);
    return ok(undefined);
  }
}
