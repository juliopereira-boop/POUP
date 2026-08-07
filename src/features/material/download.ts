/**
 * Salvar um arquivo do material de venda no aparelho.
 *
 * ------------------------------------------------------------------
 * POR QUE NÃO BASTA ABRIR A URL
 * ------------------------------------------------------------------
 * `Linking.openURL` só manda o navegador NAVEGAR até o endereço. Com imagem ele
 * mostra a foto numa aba e pronto: nada é salvo, e no celular o corretor fica
 * sem o arquivo. Era esse o "tentei baixar e não deu".
 *
 * Dois caminhos, nesta ordem:
 *
 * 1. **Compartilhar do sistema** (`navigator.share` com arquivo). É o único
 *    jeito de uma página web mandar uma imagem para a GALERIA do celular: abre
 *    a folha do sistema com "Salvar em Fotos" no iPhone e "Salvar imagem" no
 *    Android. PDF cai em "Salvar em Arquivos".
 * 2. **Link de download** (`<a download>`), quando o compartilhar não existe —
 *    é o caso do computador, onde o arquivo vai direto para a pasta Downloads.
 *
 * ------------------------------------------------------------------
 * O DETALHE QUE FAZ ISSO FUNCIONAR NO IPHONE
 * ------------------------------------------------------------------
 * `navigator.share` exige um TOQUE recente do usuário. Se o app baixar o
 * arquivo (await) e só então chamar o compartilhar, o iOS considera que o
 * toque "esfriou" e recusa em silêncio — o mesmo problema que já derrubou o
 * envio pelo WhatsApp neste projeto. Por isso o arquivo é baixado ANTES, assim
 * que o preview abre, e o botão só usa o que já está pronto.
 */

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
  /** O corretor fechou a folha sem escolher — não é erro. */
  | { ok: true; via: 'cancelled' }
  | { ok: false; error: string };

/** O aparelho sabe compartilhar ESTE arquivo? */
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
 * Baixa o conteúdo para poder compartilhar depois.
 *
 * Chamada quando o preview ABRE, não no clique: veja o cabeçalho do arquivo.
 * Devolve `null` em qualquer imprevisto — aí o botão cai no link de download,
 * que não precisa do conteúdo em mãos.
 */
export async function prefetchFile(url: string, name: string): Promise<File | null> {
  const g = globalThis as unknown as DownloadGlobal;
  if (!g.File) return null;
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
 * Salva o arquivo. Precisa ser chamada DIRETO do onPress, sem `await` antes.
 *
 * @param file  Conteúdo já baixado (de `prefetchFile`). Sem ele, vai de link.
 * @param url   URL que força o download, usada no caminho 2.
 */
export function saveFile(file: File | null, url: string | null, name: string): SaveOutcome {
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
  if (!href) return { ok: false, error: 'Não foi possível salvar o arquivo.' };

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
    return { ok: false, error: 'Não foi possível salvar o arquivo.' };
  }
}
