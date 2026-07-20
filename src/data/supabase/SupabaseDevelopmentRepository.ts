import { supabase } from '@/lib/supabase';
import type { DevelopmentRepository } from '../repositories';
import { type Development, type DevelopmentInput, type Result, err, ok } from '../types';

const SELECT =
  'id, company_id, name, delivery_date, manager_name, created_at, updated_at, companies(name)';

/** Linha retornada com o join da empresa (para exibir o nome dela na lista). */
interface DevelopmentJoinRow {
  id: string;
  company_id: string;
  name: string;
  delivery_date: string | null;
  manager_name: string | null;
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
    deliveryDate: row.delivery_date,
    managerName: row.manager_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function payload(data: DevelopmentInput) {
  return {
    company_id: data.companyId,
    name: data.name,
    delivery_date: data.deliveryDate,
    manager_name: data.managerName,
  };
}

export class SupabaseDevelopmentRepository implements DevelopmentRepository {
  async list(userId: string): Promise<Development[]> {
    const { data, error } = await supabase
      .from('developments')
      .select(SELECT)
      .eq('user_id', userId)
      .order('name', { ascending: true });
    if (error || !data) return [];
    return (data as unknown as DevelopmentJoinRow[]).map(mapDevelopment);
  }

  async create(userId: string, data: DevelopmentInput): Promise<Result<Development>> {
    const { data: row, error } = await supabase
      .from('developments')
      .insert({ user_id: userId, ...payload(data) })
      .select(SELECT)
      .single();
    if (error || !row) return err(error?.message ?? 'Falha ao salvar empreendimento.');
    return ok(mapDevelopment(row as unknown as DevelopmentJoinRow));
  }

  async update(id: string, data: DevelopmentInput): Promise<Result<Development>> {
    const { data: row, error } = await supabase
      .from('developments')
      .update({ ...payload(data), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(SELECT)
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
