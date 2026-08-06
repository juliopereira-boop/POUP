/**
 * Converte uma imagem remota em data URI para uso dentro de HTML impresso.
 *
 * POR QUE ISSO EXISTE: o PDF da proposta é montado como HTML e impresso pelo
 * próprio dispositivo do corretor. Se o `<img>` apontar para uma URL remota, o
 * navegador pode disparar a impressão ANTES de a imagem chegar — e o PDF sai
 * com um buraco no lugar da foto. Embutir a imagem como data URI garante que,
 * no momento da impressão, ela já está no documento.
 *
 * Nada aqui pode derrubar a geração da proposta: qualquer falha devolve `null`
 * e quem chama simplesmente imprime sem a foto.
 */

/**
 * Tempo máximo de espera pela imagem.
 *
 * POR QUE CURTO: o corretor está esperando o PDF na frente do cliente. Uma
 * proposta sem a foto da construtora é aceitável; uma proposta que demora dez
 * segundos (ou não sai) não é. Quatro segundos é o suficiente para uma foto de
 * perfil em 4G e curto o bastante para não parecer que o app travou.
 */
export const REMOTE_IMAGE_TIMEOUT_MS = 4000;

interface BlobReader {
  readAsDataURL: (blob: Blob) => void;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
  result: unknown;
}

interface ReaderGlobal {
  FileReader?: new () => BlobReader;
  AbortController?: new () => AbortController;
}

/** Lê o blob como data URI. Resolve `null` se o ambiente não souber fazer isso. */
function blobToDataUri(blob: Blob): Promise<string | null> {
  const Reader = (globalThis as ReaderGlobal).FileReader;
  if (!Reader) return Promise.resolve(null);
  return new Promise<string | null>((resolve) => {
    try {
      const reader = new Reader();
      reader.onload = () => {
        const result = reader.result;
        // Só serve se veio no formato `data:<mime>;base64,...`.
        resolve(typeof result === 'string' && result.startsWith('data:') ? result : null);
      };
      reader.onerror = () => resolve(null);
      reader.onabort = () => resolve(null);
      reader.readAsDataURL(blob);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Busca a imagem e devolve o data URI dela, ou `null` em qualquer imprevisto
 * (URL vazia, rede fora, 404, timeout, tipo inesperado).
 *
 * Já aceita data URI de entrada: nesse caso devolve como está, sem rede.
 */
export async function fetchImageAsDataUri(
  url: string | null | undefined,
  timeoutMs: number = REMOTE_IMAGE_TIMEOUT_MS,
): Promise<string | null> {
  const clean = (url ?? '').trim();
  if (!clean) return null;
  // Já embutida: nada a buscar.
  if (clean.startsWith('data:')) return clean;
  // Só http(s). Evita `file://`, `blob:` e afins, que não sobrevivem à impressão.
  if (!/^https?:\/\//i.test(clean)) return null;

  const Controller = (globalThis as ReaderGlobal).AbortController;
  const controller = Controller ? new Controller() : null;
  // O timeout é a rede de segurança: mesmo sem AbortController (ambientes
  // antigos), a corrida abaixo devolve `null` e a proposta segue sem a foto.
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      try {
        controller?.abort();
      } catch {
        // Abortar é otimização; falhar aqui não muda o resultado.
      }
      resolve(null);
    }, timeoutMs);
  });

  const download = (async (): Promise<string | null> => {
    try {
      const res = await fetch(clean, controller ? { signal: controller.signal } : undefined);
      if (!res.ok) return null;
      const blob = await res.blob();
      if (!blob || blob.size === 0) return null;
      return await blobToDataUri(blob);
    } catch {
      // Rede fora, CORS, abort do timeout: tudo cai aqui e vira "sem foto".
      return null;
    }
  })();

  try {
    return await Promise.race([download, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
