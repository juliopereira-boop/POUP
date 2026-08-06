import { supabase } from '@/lib/supabase';
import type { MaterialRepository } from '../repositories';
import {
  type CompanyMaterial,
  type Result,
  type StorageEntry,
  err,
  ok,
} from '../types';
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

const MAX_SEGMENT = 120;

/**
 * Monta o caminho completo no bucket a partir da RAIZ.
 *
 * A raiz é o `userId` (material do corretor) ou `CATALOG_MATERIAL_ROOT`
 * (material do catálogo, escrito pelo admin e lido por quem adotou). Quem
 * escolhe é `materialRoot()` em `@/features/catalog/material`.
 */
function joinRel(root: string, relPath: string): string {
  const rel = relPath.replace(/^\/+|\/+$/g, '');
  return rel ? `${root}/${rel}` : root;
}

function stripUnsafe(raw: string): string {
  const clean = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/]/g, '_')
    .trim();
  if (!clean || clean === '.' || clean === '..') return '';
  return clean;
}

function sanitizeSegment(raw: string): string {
  return stripUnsafe(raw).slice(0, MAX_SEGMENT).trim();
}

function sanitizeFileName(raw: string): string {
  const base = stripUnsafe(raw);
  if (base.length <= MAX_SEGMENT) return base;
  const dot = base.lastIndexOf('.');
  const ext = dot > 0 && base.length - dot <= 12 ? base.slice(dot) : '';
  return `${base.slice(0, MAX_SEGMENT - ext.length).trim()}${ext}`;
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
  async list(root: string, relPath: string): Promise<StorageEntry[]> {
    const base = joinRel(root, relPath);
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

  async createFolder(root: string, relPath: string, name: string): Promise<Result<void>> {
    const clean = sanitizeSegment(name);
    if (!clean) return err('Informe um nome válido para a pasta.');
    const path = `${joinRel(root, relPath)}/${clean}/${PLACEHOLDER}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, new Blob([''], { type: 'text/plain' }), { upsert: false });
    if (error) return err(friendly(error.message));
    return ok(undefined);
  }

  async upload(
    root: string,
    relPath: string,
    fileName: string,
    data: Blob,
    contentType: string,
  ): Promise<Result<void>> {
    const clean = sanitizeFileName(fileName) || `arquivo-${Date.now()}`;
    const path = `${joinRel(root, relPath)}/${clean}`;
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

  async download(path: string): Promise<Blob | null> {
    const { data, error } = await supabase.storage.from(BUCKET).download(path);
    if (error || !data) return null;
    return data;
  }

  /**
   * O link do material da empresa.
   *
   * Filtra só por `company_id` — sem `user_id` — porque na empresa do CATÁLOGO o
   * registro é do ADMIN, não do corretor logado: exigir `user_id = eu` fazia o
   * link cadastrado pelo POUP simplesmente não aparecer para quem adotou. Quem
   * decide o que este usuário pode ver é o RLS; aqui só se escolhe entre as
   * linhas que ele já pode ler.
   *
   * A escolha respeita a precedência: o registro do próprio corretor ganha
   * (empresa dele, ou link próprio que ele tenha salvo), e só quando não há link
   * dele é que vale o do catálogo — assim uma linha antiga com `drive_url` nulo
   * não esconde o link do admin.
   */
  async getCompanyMaterial(userId: string, companyId: string): Promise<CompanyMaterial | null> {
    const { data, error } = await supabase
      .from('company_materials')
      .select('*')
      .eq('company_id', companyId);
    if (error || !data || data.length === 0) return null;
    const mine = data.find((r) => r.user_id === userId);
    if (mine?.drive_url) return mapCompanyMaterial(mine);
    const withLink = data.find((r) => r.drive_url);
    return mapCompanyMaterial(withLink ?? mine ?? data[0]);
  }

  /**
   * Grava o link SEMPRE na linha do usuário que está salvando. No catálogo isso
   * significa a linha do admin — que é exatamente a que os adotantes leem em
   * `getCompanyMaterial`. Quem não é admin não passa pelo RLS ao tentar escrever
   * na empresa do catálogo.
   */
  async saveCompanyMaterial(
    userId: string,
    companyId: string,
    driveUrl: string | null,
  ): Promise<Result<CompanyMaterial>> {
    const trimmed = driveUrl?.trim() ?? '';
    if (trimmed && /^(javascript|data|vbscript|file):/i.test(trimmed)) {
      return err('Link inválido. Use um endereço http(s).');
    }
    const clean = trimmed ? trimmed.slice(0, 2000) : null;
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
