import { supabase } from '@/lib/supabase';
import type { ProfileRepository } from '../repositories';
import { type Result, type UserProfile, err, ok } from '../types';
import type { Database } from '../database.types';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

function mapProfile(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    fullName: row.full_name,
    agency: row.agency,
    agencyManager: row.agency_manager,
    cnpj: row.cnpj,
    cpf: row.cpf,
    phone: row.phone,
    avatarUrl: row.avatar_url,
    creci: row.creci,
    uf: row.uf,
    // Colunas do ranking (20260925150000): ausentes antes da migration.
    cidade: row.cidade ?? null,
    rankingParticipa: row.ranking_participa ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SupabaseProfileRepository implements ProfileRepository {
  async get(userId: string): Promise<UserProfile | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) return null;
    return mapProfile(data);
  }

  async upsert(
    userId: string,
    patch: Partial<Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<Result<UserProfile>> {
    const candidate = {
      full_name: patch.fullName,
      agency: patch.agency === undefined ? undefined : patch.agency?.trim() || null,
      agency_manager: patch.agencyManager,
      cnpj: patch.cnpj === undefined ? undefined : patch.cnpj?.trim() || null,
      cpf: patch.cpf,
      phone: patch.phone,
      avatar_url: patch.avatarUrl,
      creci: patch.creci,
      uf: patch.uf,
      cidade: patch.cidade === undefined ? undefined : patch.cidade?.trim() || null,
      updated_at: new Date().toISOString(),
    };
    // UPDATE preserva colunas omitidas; um UPSERT parcial pode aplicar defaults
    // a campos que não foram editados. O perfil normalmente nasce no signup.
    const changes = Object.fromEntries(
      Object.entries(candidate).filter(([, value]) => value !== undefined),
    ) as Database['public']['Tables']['profiles']['Update'];
    let { data, error } = await supabase
      .from('profiles')
      .update(changes)
      .eq('id', userId)
      .select('*')
      .maybeSingle();
    // Sem a migration do ranking, a coluna `cidade` não existe: salva o resto
    // em vez de recusar o perfil inteiro por causa dela.
    if (error && changes.cidade !== undefined && /cidade/.test(error.message ?? '')) {
      delete changes.cidade;
      ({ data, error } = await supabase
        .from('profiles')
        .update(changes)
        .eq('id', userId)
        .select('*')
        .maybeSingle());
    }
    if (!error && !data) {
      const inserted = await supabase
        .from('profiles')
        .insert({ id: userId, ...changes })
        .select('*')
        .single();
      data = inserted.data;
      error = inserted.error;
    }
    if (error || !data) {
      if (error && /profiles_cpf_digits_unique/i.test(error.message)) {
        return err('Este CPF já está cadastrado em outra conta.');
      }
      if (error && /profiles_cpf_11_digits/i.test(error.message)) {
        return err('Informe um CPF com 11 dígitos.');
      }
      if (error && /profiles_uf_valida/i.test(error.message)) {
        return err('Selecione um estado válido.');
      }
      if (error && /profiles_cidade_tamanho/i.test(error.message)) {
        return err('Informe o nome da cidade.');
      }
      return err(error?.message ?? 'Falha ao salvar perfil.');
    }
    return ok(mapProfile(data));
  }
}
