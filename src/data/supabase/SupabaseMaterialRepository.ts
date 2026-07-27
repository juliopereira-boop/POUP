import { supabase } from '@/lib/supabase';
import type { MaterialRepository } from '../repositories';
import { type CompanyMaterial, type Result, type StorageEntry, err, ok } from '../types';
import type { Database } from '../database.types';

type CompanyMaterialRow = Database['public']['Tables']['company_materials']['Row'];

const BUCKET = 'uploads';
const PLACEHOLDER = '.emptyFolderPlaceholder';

interface RawObject {
  name: string;
  id: string | null;
  updated_at: string | null;
  metadata: { size?: number; mimetype?: string } | null;
}

function joinRel(userId: string, relPath: string): string {
  const rel = relPath.replace(/^\/+|\/+$/g, '');
  return rel ? `${userId}/${rel}` : userId;
}

function mapCompanyMaterial(row: CompanyMaterialRow): CompanyMaterial {
  return { companyId: row.company_id, driveUrl: row.drive_url };
}

function friendly(message: string): string {
  if (/Limite de armazenamento/i.test(message)) return message;
  if (/exceeded|quota|storage/i.test(message)) {
    return 'Limite de armazenamento do plano atingido. Faça upgrade para o plano Pro.';
  }
  if (/already exists|duplicate/i.test(message)) return 'Já existe um item com esse nome aqui.';
  return message;
}

export class SupabaseMaterialRepository implements MaterialRepository {
  async list(userId: string, relPath: string): Promise<StorageEntry[]> {
    const base = joinRel(userId, relPath);
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(base, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
    if (error || !data) return [];
    return (data as RawObject[])
      .filter((o) => o.name !== PLACEHOLDER)
      .map((o) => {
        const isFolder = o.id === null;
        return {
          name: o.name,
          path: `${base}/${o.name}`,
          isFolder,
          size: o.metadata?.size ?? null,
          updatedAt: o.updated_at ?? null,
          mimeType: o.metadata?.mimetype ?? null,
        };
      })
      .sort((a, b) => (a.isFolder === b.isFolder ? 0 : a.isFolder ? -1 : 1));
  }

  async createFolder(userId: string, relPath: string, name: string): Promise<Result<void>> {
    const clean = name.trim().replace(/[\\/]/g, '').trim();
    if (!clean) return err('Informe um nome para a pasta.');
    const path = `${joinRel(userId, relPath)}/${clean}/${PLACEHOLDER}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, new Blob([''], { type: 'text/plain' }), { upsert: false });
    if (error) return err(friendly(error.message));
    return ok(undefined);
  }

  async upload(
    userId: string,
    relPath: string,
    fileName: string,
    data: Blob,
    contentType: string,
  ): Promise<Result<void>> {
    const clean = fileName.replace(/[\\/]/g, '_').trim() || `arquivo-${Date.now()}`;
    const path = `${joinRel(userId, relPath)}/${clean}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, data, { contentType, upsert: false });
    if (error) return err(friendly(error.message));
    return ok(undefined);
  }

  private async collectPaths(prefix: string): Promise<string[]> {
    const { data } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 });
    if (!data || data.length === 0) return [];
    const out: string[] = [];
    for (const o of data as RawObject[]) {
      const childPath = `${prefix}/${o.name}`;
      if (o.id === null) {
        out.push(...(await this.collectPaths(childPath)));
      } else {
        out.push(childPath);
      }
    }
    return out;
  }

  async remove(path: string, isFolder: boolean): Promise<Result<void>> {
    let targets: string[];
    if (isFolder) {
      targets = await this.collectPaths(path);
      if (targets.length === 0) targets = [`${path}/${PLACEHOLDER}`];
    } else {
      targets = [path];
    }
    const { error } = await supabase.storage.from(BUCKET).remove(targets);
    if (error) return err(friendly(error.message));
    return ok(undefined);
  }

  async signedUrl(path: string, expiresIn = 3600): Promise<string | null> {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
    if (error || !data) return null;
    return data.signedUrl;
  }

  async getCompanyMaterial(userId: string, companyId: string): Promise<CompanyMaterial | null> {
    const { data, error } = await supabase
      .from('company_materials')
      .select('*')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (error || !data) return null;
    return mapCompanyMaterial(data);
  }

  async saveCompanyMaterial(
    userId: string,
    companyId: string,
    driveUrl: string | null,
  ): Promise<Result<CompanyMaterial>> {
    const clean = driveUrl?.trim() ? driveUrl.trim() : null;
    const { data, error } = await supabase
      .from('company_materials')
      .upsert(
        { user_id: userId, company_id: companyId, drive_url: clean },
        { onConflict: 'user_id,company_id' },
      )
      .select('*')
      .single();
    if (error || !data) return err(error?.message ?? 'Falha ao salvar o material da empresa.');
    return ok(mapCompanyMaterial(data));
  }
}
