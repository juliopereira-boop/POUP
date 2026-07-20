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
    phone: row.phone,
    avatarUrl: row.avatar_url,
    creci: row.creci,
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
    const { data, error } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        full_name: patch.fullName,
        agency: patch.agency,
        agency_manager: patch.agencyManager,
        cnpj: patch.cnpj,
        phone: patch.phone,
        avatar_url: patch.avatarUrl,
        creci: patch.creci,
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single();
    if (error || !data) return err(error?.message ?? 'Falha ao salvar perfil.');
    return ok(mapProfile(data));
  }
}
