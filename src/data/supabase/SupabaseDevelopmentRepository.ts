import { supabase } from '@/lib/supabase';
import type { DevelopmentRepository } from '../repositories';
import { type Development, type DevelopmentInput, type Result, err, ok } from '../types';
import { fetchAdoptedCompanyIds } from './SupabaseCatalogRepository';
import {
  DEVELOPMENT_SELECT,
  mapDevelopment,
  type DevelopmentJoinRow,
} from './developmentRow';

function payload(data: DevelopmentInput) {
  return {
    company_id: data.companyId,
    name: data.name,
    description: data.description,
    delivery_date: data.deliveryDate,
    manager_name: data.managerName,
  };
}

export class SupabaseDevelopmentRepository implements DevelopmentRepository {
  /**
   * Mesma união da `CompanyRepository.list`: os empreendimentos do corretor mais
   * TODOS os das empresas do catálogo que ele adotou — sem cópia, são as mesmas
   * linhas do admin, então empreendimento novo no catálogo aparece sozinho aqui.
   */
  async list(userId: string): Promise<Development[]> {
    const adoptedIds = await fetchAdoptedCompanyIds(userId);

    const [own, adopted] = await Promise.all([
      supabase.from('developments').select(DEVELOPMENT_SELECT).eq('user_id', userId),
      adoptedIds.length > 0
        ? supabase.from('developments').select(DEVELOPMENT_SELECT).in('company_id', adoptedIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const ownRows = (own.data ?? []) as unknown as DevelopmentJoinRow[];
    const adoptedRows = (adopted.data ?? []) as unknown as DevelopmentJoinRow[];

    // O filtro de empresa-não-catálogo é feito AQUI, no cliente: no PostgREST um
    // filtro em tabela embutida (`companies.is_catalog`) não descarta a linha
    // pai, então o empreendimento continuaria vindo — só sem a empresa embutida.
    const byId = new Map<string, Development>();
    for (const row of ownRows) {
      if (row.companies?.is_catalog) continue;
      byId.set(row.id, mapDevelopment(row));
    }
    // Depois das próprias: se o admin adotou a própria empresa do catálogo, a
    // linha é a mesma e não pode duplicar.
    for (const row of adoptedRows) byId.set(row.id, mapDevelopment(row));

    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  async create(userId: string, data: DevelopmentInput): Promise<Result<Development>> {
    const { data: row, error } = await supabase
      .from('developments')
      .insert({ user_id: userId, ...payload(data) })
      .select(DEVELOPMENT_SELECT)
      .single();
    if (error || !row) return err(error?.message ?? 'Falha ao salvar empreendimento.');
    return ok(mapDevelopment(row as unknown as DevelopmentJoinRow));
  }

  async update(id: string, data: DevelopmentInput): Promise<Result<Development>> {
    const { data: row, error } = await supabase
      .from('developments')
      .update({ ...payload(data), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(DEVELOPMENT_SELECT)
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
