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
 */
import * as FileSystem from 'expo-file-system';
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
export async function prefetchFile(url: string, name: string): Promise<File | null> {
  const g = globalThis as unknown as DownloadGlobal;
  if (!isWeb || !g.File) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob || blob.size === 0) return null;
    return new g.File([blob], name, { type: blob.type || 'application/octet-stream' });
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
      void g.navigator?.share?.({ files: [file], title: name })?.catch(() => {
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
export async function saveFileNative(url: string, name: string): Promise<SaveOutcome> {
  const dir = FileSystem.cacheDirectory;
  if (!dir) return { ok: false, error: ERRO_GENERICO };

  const destino = `${dir}${safeFileName(name)}`;
  try {
    const { status } = await FileSystem.downloadAsync(url, destino);
    if (status !== 200) return { ok: false, error: 'Não foi possível baixar o arquivo.' };
  } catch {
    return { ok: false, error: 'Não foi possível baixar o arquivo.' };
  }

  if (!(await Sharing.isAvailableAsync())) {
    // Sem folha de compartilhamento o arquivo até baixou, mas ficou num cache
    // que o corretor não alcança. Dizer "salvo" aqui seria mentira.
    return { ok: false, error: 'Este aparelho não permite compartilhar arquivos.' };
  }

  try {
    await Sharing.shareAsync(destino);
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
): SaveOutcome | Promise<SaveOutcome> {
  if (isWeb) return saveFileWeb(file, url, name);
  if (!url) return { ok: false, error: ERRO_GENERICO };
  return saveFileNative(url, name);
}
