/**
 * Que tipo de arquivo é este — e como ele deve ser mostrado.
 *
 * O material de venda do corretor é uma mistura de planta em PDF, foto da
 * fachada, tabela de preços e vídeo do drone. Cada um pede um tratamento
 * diferente na miniatura e no preview, e o único dado confiável que o Storage
 * devolve é o NOME do arquivo — o `mimeType` costuma vir vazio na listagem.
 * Por isso a extensão manda, e o mime é só reforço.
 */

export type FileKind = 'folder' | 'image' | 'video' | 'pdf' | 'doc' | 'sheet' | 'other';

const IMAGE = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif', 'avif'];
const VIDEO = ['mp4', 'mov', 'webm', 'm4v', 'avi', 'mkv', '3gp'];
const DOC = ['doc', 'docx', 'txt', 'rtf', 'odt'];
const SHEET = ['xls', 'xlsx', 'csv', 'ods'];

/** Extensão em minúsculas, sem o ponto. Vazio quando o nome não tem extensão. */
export function fileExt(name: string): string {
  const clean = (name ?? '').trim();
  const dot = clean.lastIndexOf('.');
  if (dot <= 0 || dot === clean.length - 1) return '';
  return clean.slice(dot + 1).toLowerCase();
}

export function fileKind(
  name: string,
  mimeType?: string | null,
  isFolder = false,
): FileKind {
  if (isFolder) return 'folder';
  const ext = fileExt(name);
  const mime = (mimeType ?? '').toLowerCase();

  if (IMAGE.includes(ext) || mime.startsWith('image/')) return 'image';
  if (VIDEO.includes(ext) || mime.startsWith('video/')) return 'video';
  if (ext === 'pdf' || mime.includes('pdf')) return 'pdf';
  if (SHEET.includes(ext) || mime.includes('spreadsheet') || mime.includes('excel')) return 'sheet';
  if (DOC.includes(ext) || mime.includes('word') || mime.startsWith('text/')) return 'doc';
  return 'other';
}

/** Ícone e cor de fundo da miniatura, por tipo. */
export const KIND_BADGE: Record<FileKind, { icon: string; label: string }> = {
  folder: { icon: '📁', label: 'Pasta' },
  image: { icon: '🖼️', label: 'Imagem' },
  video: { icon: '🎬', label: 'Vídeo' },
  pdf: { icon: '📕', label: 'PDF' },
  doc: { icon: '📝', label: 'Documento' },
  sheet: { icon: '📊', label: 'Planilha' },
  other: { icon: '📎', label: 'Arquivo' },
};

/**
 * Dá para mostrar este arquivo dentro do app?
 *
 * Imagem e vídeo tocam direto. PDF depende do visualizador do navegador — vai
 * na tentativa, e a tela sempre oferece "Abrir em nova aba" como saída. Os
 * demais (planilha, .docx) nenhum navegador renderiza sozinho: para eles o
 * caminho honesto é baixar.
 */
export function canPreviewInApp(kind: FileKind): boolean {
  return kind === 'image' || kind === 'video' || kind === 'pdf';
}

/** Só imagem vira miniatura de verdade; o resto mostra o ícone do tipo. */
export function usesImageThumb(kind: FileKind): boolean {
  return kind === 'image';
}
