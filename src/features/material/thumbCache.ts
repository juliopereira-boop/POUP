/**
 * Cache das miniaturas do material de venda.
 *
 * ------------------------------------------------------------------
 * O TRUQUE: guardar a URL, não a imagem
 * ------------------------------------------------------------------
 * Os arquivos ficam num bucket privado, então cada miniatura precisa de uma
 * URL ASSINADA. O problema não era baixar a foto de novo — era que cada visita
 * gerava uma assinatura NOVA, com query string diferente. Para o navegador,
 * URL diferente é imagem diferente: ele descartava o cache e baixava tudo
 * outra vez.
 *
 * Guardando a mesma URL enquanto ela vale, a segunda visita pede exatamente o
 * mesmo endereço — e aí o cache HTTP do próprio navegador entrega a imagem na
 * hora, sem rede. É por isso que aqui não se guarda byte de imagem nenhum:
 * guardar as fotos em base64 estouraria o limite de armazenamento do navegador
 * (uns 5 MB no total) com meia dúzia de plantas.
 *
 * A assinatura é pedida com validade longa justamente para o cache render.
 */
import { sessionStorage } from '@/lib/storage';

/** Validade da assinatura pedida ao servidor. Sete dias. */
export const THUMB_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Margem de segurança: a URL é descartada um pouco antes de expirar de fato,
 * para o corretor nunca ver a miniatura quebrar bem na hora do vencimento.
 */
const SAFETY_MARGIN_MS = 60 * 60 * 1000;

const KEY = 'poup.material.thumbs.v1';

/** Teto de entradas guardadas, para o cache não crescer sem fim. */
const MAX_ENTRIES = 400;

interface CachedThumb {
  url: string;
  /** Momento (epoch ms) em que a assinatura deixa de valer. */
  expiresAt: number;
}

type CacheMap = Record<string, CachedThumb>;

/** Cópia em memória: evita ler o disco a cada render da lista. */
let memo: CacheMap | null = null;

function isFresh(entry: CachedThumb | undefined, now: number): entry is CachedThumb {
  return Boolean(entry?.url) && (entry as CachedThumb).expiresAt - SAFETY_MARGIN_MS > now;
}

async function readAll(): Promise<CacheMap> {
  if (memo) return memo;
  try {
    const raw = await sessionStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    memo = parsed && typeof parsed === 'object' ? (parsed as CacheMap) : {};
  } catch {
    // Cache corrompido não pode derrubar a tela: começa vazio.
    memo = {};
  }
  return memo;
}

async function writeAll(map: CacheMap): Promise<void> {
  memo = map;
  try {
    await sessionStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // Sem espaço ou modo privativo: o cache vira só o de memória.
  }
}

/**
 * As URLs ainda válidas dos caminhos pedidos.
 *
 * @returns `hits` para usar já e `misses` para pedir assinatura ao servidor.
 */
export async function getCachedThumbs(
  paths: string[],
  now: number = Date.now(),
): Promise<{ hits: Record<string, string>; misses: string[] }> {
  const map = await readAll();
  const hits: Record<string, string> = {};
  const misses: string[] = [];
  for (const path of paths) {
    const entry = map[path];
    if (isFresh(entry, now)) hits[path] = entry.url;
    else misses.push(path);
  }
  return { hits, misses };
}

/** Guarda as URLs recém-assinadas, descartando as vencidas e o excesso. */
export async function putCachedThumbs(
  urls: Record<string, string>,
  ttlSeconds: number = THUMB_TTL_SECONDS,
  now: number = Date.now(),
): Promise<void> {
  if (Object.keys(urls).length === 0) return;
  const map = await readAll();
  const expiresAt = now + ttlSeconds * 1000;
  for (const [path, url] of Object.entries(urls)) map[path] = { url, expiresAt };

  // Limpeza: primeiro o que já venceu; se ainda passar do teto, sai o que
  // vence mais cedo (é o que menos serve daqui para frente).
  let entries = Object.entries(map).filter(([, v]) => v.expiresAt > now);
  if (entries.length > MAX_ENTRIES) {
    entries = entries.sort((a, b) => b[1].expiresAt - a[1].expiresAt).slice(0, MAX_ENTRIES);
  }
  await writeAll(Object.fromEntries(entries));
}

/** Esquece tudo. Usado quando o corretor sai da conta. */
export async function clearThumbCache(): Promise<void> {
  memo = {};
  try {
    await sessionStorage.removeItem(KEY);
  } catch {
    // Nada a fazer: a cópia em memória já foi zerada.
  }
}
