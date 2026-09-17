/** Persistência nativa: gerações de pequenos valores no cofre, sem fallback público. */
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
type Head = { version: 1; generation: string; count: number } | { version: 1; deleted: true };
const MAX_CHUNKS = 256;
function parseHead(value: string | null): Head | null {
  if (value === null) return null;
  const head = JSON.parse(value) as Head;
  if (head?.version === 1) {
    if ('deleted' in head && head.deleted === true) return head;
    if ('generation' in head && /^[a-zA-Z0-9-]{1,64}$/.test(head.generation)
      && Number.isInteger(head.count) && head.count > 0 && head.count <= MAX_CHUNKS) return head;
  }
  throw new Error('Sessão no cofre inválida.');
}
export function createSecureTokenStorage(
  secure: KeyValueStorage, legacy: KeyValueStorage, newGeneration: () => string,
): KeyValueStorage {
  const pending = new Map<string, Promise<unknown>>();
  const headKey = (key: string) => `${key}.secure-v2`;
  const chunkKey = (key: string, generation: string, index: number) =>
    `${key}.secure-v2.${generation}.${index}`;

  // Refresh, logout e troca de conta não podem intercalar escritas da mesma chave.
  function serialize<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const next = (pending.get(key) ?? Promise.resolve()).catch(() => undefined).then(operation);
    pending.set(key, next);
    void next.finally(() => {
      if (pending.get(key) === next) pending.delete(key);
    }).catch(() => undefined);
    return next;
  }
  async function cleanChunks(key: string, head: Head | null): Promise<void> {
    if (!head || !('generation' in head)) return;
    await Promise.all(Array.from({ length: head.count }, (_, i) =>
      secure.removeItem(chunkKey(key, head.generation, i)).catch(() => {
        console.warn('Não foi possível limpar um fragmento antigo do cofre.');
      })));
  }
  async function cleanLegacy(key: string): Promise<void> {
    await legacy.removeItem(key);
    await secure.removeItem(key);
  }
  async function write(key: string, value: string): Promise<void> {
    const previous = await secure.getItem(headKey(key));
    let old: Head | null = null;
    try { old = parseHead(previous); } catch { /* um novo login substitui a sessão corrompida */ }
    // 400 pontos de código: no máximo 1600 bytes UTF-8, sem cortar um emoji.
    const points = Array.from(value);
    const chunks: string[] = [];
    for (let i = 0; i < points.length; i += 400) chunks.push(points.slice(i, i + 400).join(''));
    if (!chunks.length) chunks.push('');
    if (chunks.length > MAX_CHUNKS) throw new Error('Sessão grande demais para o cofre.');
    const generation = newGeneration();
    if (!/^[a-zA-Z0-9-]{1,64}$/.test(generation)) throw new Error('Identificador do cofre inválido.');
    const head: Head = { version: 1, generation, count: chunks.length };
    try {
      for (let i = 0; i < chunks.length; i++) {
        await secure.setItem(chunkKey(key, generation, i), chunks[i]);
      }
      // Só publicar quando TODOS os fragmentos estiverem persistidos.
      await secure.setItem(headKey(key), JSON.stringify(head));
    } catch (error) {
      await cleanChunks(key, head);
      throw error;
    }
    await cleanChunks(key, old);
    await cleanLegacy(key);
  }
  async function remove(key: string): Promise<void> {
    // A lápide impede que uma limpeza interrompida ressuscite a sessão legada.
    let old: Head | null = null;
    try { old = parseHead(await secure.getItem(headKey(key))); } catch { /* cofre corrompido */ }
    await secure.setItem(headKey(key), JSON.stringify({ version: 1, deleted: true }));
    await cleanChunks(key, old);
    await cleanLegacy(key);
  }
  return {
    getItem: (key) => serialize(key, async () => {
      const saved = await secure.getItem(headKey(key));
      let head: Head | null;
      try { head = parseHead(saved); } catch {
        await remove(key);
        return null;
      }
      if (head) {
        await cleanLegacy(key);
        if ('deleted' in head) return null;
        const chunks = await Promise.all(Array.from({ length: head.count }, (_, i) =>
          secure.getItem(chunkKey(key, head.generation, i))));
        if (chunks.some((chunk) => chunk === null)) {
          await remove(key);
          return null;
        }
        return chunks.join('');
      }
      const [oldSecure, oldPlain] = await Promise.all([secure.getItem(key), legacy.getItem(key)]);
      if (oldSecure !== null && oldPlain !== null && oldSecure !== oldPlain) {
        // O legado não informa qual cópia é recente: exigir novo login.
        await remove(key);
        return null;
      }
      const value = oldSecure ?? oldPlain;
      if (value !== null) await write(key, value);
      return value;
    }),
    setItem: (key, value) => serialize(key, () => write(key, value)),
    removeItem: (key) => serialize(key, () => remove(key)),
  };
}
