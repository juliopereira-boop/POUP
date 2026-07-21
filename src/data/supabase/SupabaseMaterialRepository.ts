import { supabase } from '@/lib/supabase';
import type { MaterialRepository } from '../repositories';
import { type Result, type StorageEntry, err, ok } from '../types';

const BUCKET = 'uploads';
/** Nome do objeto-placeholder que "materializa" uma pasta vazia no Storage. */
const PLACEHOLDER = '.emptyFolderPlaceholder';

/** Item cru retornado pelo Storage do Supabase. */
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

/** Traduz erros conhecidos do Storage para mensagens amigáveis. */
function friendly(message: string): string {
  if (/Limite de armazenamento/i.test(message)) return message; // já é PT (trigger de cota)
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
      // Pastas primeiro, depois arquivos (ambos já em ordem alfabética).
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
      // Pasta vazia: remove ao menos o placeholder.
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
}
