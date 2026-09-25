/**
 * Salvar um arquivo no aparelho — web e celular.
 *
 * ------------------------------------------------------------------
 * SÃO DOIS PROBLEMAS DIFERENTES, NÃO UM SÓ
 * ------------------------------------------------------------------
 * **No navegador**, o obstáculo é que não existe "salvar na galeria". A única
 * ponte é `navigator.share` com um `File` dentro: aí o sistema abre a folha
 * com "Salvar em Fotos" (iPhone) ou "Salvar imagem" (Android), e PDF cai em
 * "Salvar em Arquivos". Sem isso, sobra o `<a download>`, que no computador
 * resolve e no celular costuma só abrir o arquivo numa aba.
 *
 * **No celular (app das lojas)**, `navigator.share` e `<a download>` não
 * existem — nem o DOM existe. O caminho é gravar o conteúdo num arquivo local
 * e entregar esse caminho ao `expo-sharing`, que abre a mesma folha do sistema.
 *
 * Por isso os dois lados vivem aqui juntos, mas separados de verdade: o que o
 * navegador precisa não funciona no app, e vice-versa.
 *
 * ------------------------------------------------------------------
 * O DETALHE QUE FAZ ISSO FUNCIONAR NO IPHONE (WEB)
 * ------------------------------------------------------------------
 * `navigator.share` exige um TOQUE recente. Se o app baixar o arquivo (`await`)
 * e só então chamar o compartilhar, o Safari considera que o toque "esfriou" e
 * recusa em silêncio — o mesmo problema que já derrubou o envio pelo WhatsApp
 * neste projeto. Por isso, na web, o conteúdo é baixado ANTES (quando o preview
 * abre) e o botão só usa o que já está pronto.
 *
 * No app nativo essa regra não existe, então lá o download acontece na hora do
 * toque mesmo — e é por isso que `saveFileNative` pode ser assíncrona sem medo.
 *
 * ------------------------------------------------------------------
 * "SALVAR IMAGEM" QUE NÃO SALVAVA NADA
 * ------------------------------------------------------------------
 * A folha do iPhone oferecia "Salvar imagem", o corretor tocava, e a galeria
 * continuava vazia. Três causas, três cuidados:
 *
 *   * NA WEB, o Fotos só aceita o que reconhece como imagem. O tipo vinha do
 *     servidor (às vezes genérico, às vezes WebP/HEIC que o Fotos recusa) e o
 *     nome nem sempre tinha extensão. Agora o tipo é lido dos PRÓPRIOS BYTES,
 *     o nome ganha a extensão certa, e imagem que não é JPEG nem PNG é
 *     convertida para JPEG antes de ir para a folha;
 *   * na web, a imagem vai para a folha SEM título: com texto junto, o iPhone
 *     trata o compartilhamento como texto + anexo e o "Salvar imagem" falha;
 *   * NO APP, gravar na galeria exige a permissão de "adicionar fotos"
 *     (NSPhotoLibraryAddUsageDescription, em app.json) — sem ela o iOS
 *     simplesmente não grava. E o arquivo baixado precisa de extensão, senão
 *     a folha nem sabe que é imagem.
 */
// `File` do expo-file-system tem o MESMO NOME do `File` do navegador, que
// este arquivo também usa (é o conteúdo que vai para `navigator.share`).
// Sem o apelido, um sombreia o outro e o caminho da web deixa de compilar.
import { File as ArquivoLocal, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';

interface ShareCapableNavigator {
  share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  canShare?: (data: { files?: File[] }) => boolean;
}

interface DownloadDoc {
  createElement: (tag: string) => {
    href: string;
    download: string;
    rel: string;
    target: string;
    style: { display: string };
    click: () => void;
  };
  body: { appendChild: (n: unknown) => void; removeChild: (n: unknown) => void };
}

interface DownloadGlobal {
  navigator?: ShareCapableNavigator;
  document?: DownloadDoc;
  URL?: { createObjectURL: (b: Blob) => string; revokeObjectURL: (u: string) => void };
  File?: new (parts: BlobPart[], name: string, options?: { type?: string }) => File;
  setTimeout: (cb: () => void, ms: number) => void;
}

export type SaveOutcome =
  /** Foi para a folha de compartilhamento: o corretor escolhe Fotos ou Arquivos. */
  | { ok: true; via: 'share' }
  /** Baixou direto (computador). */
  | { ok: true; via: 'download' }
  | { ok: false; error: string };

const ERRO_GENERICO = 'Não foi possível salvar o arquivo.';

/* --- WEB ---------------------------------------------------------------- */

/** Imagem, PDF ou vídeo: é o que decide conversão e extensão. */
export type TipoDoArquivo = 'image' | 'pdf' | 'video' | 'other';

const EXTENSAO: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
  'video/mp4': 'mp4',
};

/** O tipo pelo começo do arquivo — o nome e o servidor podem mentir, os bytes não. */
export function tipoPelosBytes(b: Uint8Array): string | null {
  const ascii = (i: number, n: number) => String.fromCharCode(...b.slice(i, i + n));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && ascii(1, 3) === 'PNG') return 'image/png';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image/webp';
  if (ascii(0, 3) === 'GIF') return 'image/gif';
  if (ascii(4, 4) === 'ftyp' && /^(heic|heix|hevc|mif1|msf1)$/.test(ascii(8, 4))) return 'image/heic';
  if (ascii(0, 4) === '%PDF') return 'application/pdf';
  if (ascii(4, 4) === 'ftyp') return 'video/mp4';
  return null;
}

/** O nome com a extensão que combina com o tipo ("foto" + JPEG → "foto.jpg"). */
export function nomeComExtensao(nome: string, tipo: string | null): string {
  const ext = tipo ? EXTENSAO[tipo] : undefined;
  if (!ext) return nome;
  const base = nome.replace(/\.[A-Za-z0-9]{1,5}$/, '');
  return `${base || 'arquivo'}.${ext}`;
}

/**
 * Converte a imagem para JPEG no navegador. O Fotos do iPhone aceita JPEG e
 * PNG sem discussão; WebP, HEIC e GIF saindo da web são onde ele falha calado.
 */
async function paraJpeg(blob: Blob): Promise<Blob | null> {
  const g = globalThis as unknown as {
    createImageBitmap?: (b: Blob) => Promise<{ width: number; height: number; close?: () => void }>;
    document?: { createElement: (t: 'canvas') => HTMLCanvasElement };
  };
  if (!g.createImageBitmap || !g.document) return null;
  try {
    const img = await g.createImageBitmap(blob);
    const canvas = g.document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    // Fundo branco: transparência vira preto no JPEG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img as unknown as CanvasImageSource, 0, 0);
    img.close?.();
    return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92));
  } catch {
    return null;
  }
}

/** O navegador sabe compartilhar ESTE arquivo? */
export function canShareFile(file: File | null): boolean {
  if (!file) return false;
  const nav = (globalThis as unknown as DownloadGlobal).navigator;
  if (!nav?.share || !nav.canShare) return false;
  try {
    return nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * Baixa o conteúdo para poder compartilhar depois. **Só web.**
 *
 * Chamada quando o preview ABRE, não no clique — veja o cabeçalho do arquivo.
 * Devolve `null` em qualquer imprevisto: aí o botão cai no link de download,
 * que não precisa do conteúdo em mãos.
 */
export async function prefetchFile(
  url: string,
  name: string,
  tipoEsperado: TipoDoArquivo = 'other',
): Promise<File | null> {
  const g = globalThis as unknown as DownloadGlobal;
  if (!isWeb || !g.File) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    let blob = await res.blob();
    if (!blob || blob.size === 0) return null;

    const pelosBytes = tipoPelosBytes(new Uint8Array(await blob.slice(0, 32).arrayBuffer()));
    let tipo = pelosBytes ?? (blob.type && blob.type !== 'application/octet-stream' ? blob.type : null);
    const ehImagem = tipoEsperado === 'image' || Boolean(tipo?.startsWith('image/'));
    if (ehImagem && tipo !== 'image/jpeg' && tipo !== 'image/png') {
      const jpeg = await paraJpeg(blob);
      if (jpeg) {
        blob = jpeg;
        tipo = 'image/jpeg';
      }
    }
    return new g.File([blob], nomeComExtensao(name, tipo), { type: tipo ?? 'application/octet-stream' });
  } catch {
    return null;
  }
}

/**
 * Salva no navegador. Precisa ser chamada DIRETO do onPress, sem `await` antes.
 *
 * @param file Conteúdo já baixado (de `prefetchFile`). Sem ele, vai de link.
 * @param url  URL que força o download, usada no caminho 2.
 */
export function saveFileWeb(file: File | null, url: string | null, name: string): SaveOutcome {
  const g = globalThis as unknown as DownloadGlobal;

  // 1. Folha do sistema: o único caminho que leva imagem para a galeria.
  if (file && canShareFile(file)) {
    try {
      // Imagem vai SEM título: com texto junto, o "Salvar imagem" do iPhone falha.
      const dados = file.type.startsWith('image/') ? { files: [file] } : { files: [file], title: name };
      void g.navigator?.share?.(dados)?.catch(() => {
        // Fechar a folha rejeita a promessa. Não é erro: o corretor desistiu.
      });
      return { ok: true, via: 'share' };
    } catch {
      // Compartilhar falhou: segue para o link.
    }
  }

  // 2. Link de download.
  const doc = g.document;
  if (!doc) return { ok: false, error: 'Não foi possível salvar o arquivo neste aparelho.' };

  // Com o conteúdo em mãos, o link aponta para ele: funciona mesmo se a
  // assinatura da URL tiver vencido enquanto o preview ficou aberto.
  let objectUrl: string | null = null;
  if (file && g.URL?.createObjectURL) {
    try {
      objectUrl = g.URL.createObjectURL(file);
    } catch {
      objectUrl = null;
    }
  }

  const href = objectUrl ?? url;
  if (!href) return { ok: false, error: ERRO_GENERICO };

  try {
    const a = doc.createElement('a');
    a.href = href;
    a.download = name;
    a.rel = 'noopener';
    a.style.display = 'none';
    doc.body.appendChild(a);
    a.click();
    doc.body.removeChild(a);
    if (objectUrl) {
      // Revogar na hora cancelaria o download que acabou de começar.
      g.setTimeout(() => g.URL?.revokeObjectURL(objectUrl as string), 60_000);
    }
    return { ok: true, via: 'download' };
  } catch {
    return { ok: false, error: ERRO_GENERICO };
  }
}

/* --- CELULAR ------------------------------------------------------------ */

/** Tira do nome tudo que atrapalharia como nome de arquivo no disco. */
function safeFileName(name: string): string {
  const limpo = name.replace(/[/\\?%*:|"<>]/g, '-').trim();
  return limpo.length > 0 ? limpo : 'arquivo';
}

/**
 * Salva no app nativo: baixa para o cache e abre a folha do sistema.
 *
 * O arquivo vai para o cache (e não para uma pasta permanente) de propósito —
 * ele é só a ponte até a folha de compartilhamento; quem decide onde guardar de
 * verdade é o corretor, e o sistema limpa o cache sozinho depois.
 */
export async function saveFileNative(
  url: string,
  name: string,
  tipoEsperado: TipoDoArquivo = 'other',
): Promise<SaveOutcome> {
  // API de arquivos do SDK 54: `Paths.cache` é a pasta e o destino é criado
  // antes. (Antes era `FileSystem.cacheDirectory` + `downloadAsync`, que hoje
  // só existem em `expo-file-system/legacy`.)
  //
  // Usamos o `destino` que criamos, e não o retorno de `downloadFileAsync`,
  // porque a tipagem do pacote declara esse retorno como o `File` do NAVEGADOR
  // em vez do dele mesmo. Como o download grava no destino informado, o `uri`
  // que interessa já está aqui.
  // Sem extensão, a folha do sistema não sabe que é imagem e o "Salvar
  // imagem" não grava. Imagem sem extensão conhecida vai como .jpg.
  const temExtensao = /\.[A-Za-z0-9]{2,5}$/.test(name);
  const nome = temExtensao ? name : tipoEsperado === 'image' ? `${name}.jpg` : tipoEsperado === 'pdf' ? `${name}.pdf` : name;
  const destino = new ArquivoLocal(Paths.cache, safeFileName(nome));
  try {
    // `idempotent`: salvar o mesmo arquivo duas vezes sobrescreve o do cache;
    // sem isso a segunda tentativa falhava com "arquivo já existe".
    await ArquivoLocal.downloadFileAsync(url, destino, { idempotent: true });
  } catch {
    return { ok: false, error: 'Não foi possível baixar o arquivo.' };
  }

  if (!(await Sharing.isAvailableAsync())) {
    // Sem folha de compartilhamento o arquivo até baixou, mas ficou num cache
    // que o corretor não alcança. Dizer "salvo" aqui seria mentira.
    return { ok: false, error: 'Este aparelho não permite compartilhar arquivos.' };
  }

  try {
    await Sharing.shareAsync(destino.uri);
    return { ok: true, via: 'share' };
  } catch {
    // Fechar a folha também cai aqui, e desistir não é erro.
    return { ok: true, via: 'share' };
  }
}

/* --- A porta única ------------------------------------------------------ */

/**
 * Salva o arquivo, escolhendo o caminho do ambiente.
 *
 * Na web devolve **de forma síncrona por dentro** (o `file` já veio pronto),
 * porque um `await` antes do `navigator.share` quebra no iPhone. No celular a
 * espera é normal.
 */
export function saveFile(
  file: File | null,
  url: string | null,
  name: string,
  tipoEsperado: TipoDoArquivo = 'other',
): SaveOutcome | Promise<SaveOutcome> {
  if (isWeb) return saveFileWeb(file, url, file?.name ?? name);
  if (!url) return { ok: false, error: ERRO_GENERICO };
  return saveFileNative(url, name, tipoEsperado);
}
