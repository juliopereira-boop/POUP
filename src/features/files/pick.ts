/**
 * Escolher arquivos do aparelho — um caminho só, web e celular.
 *
 * ------------------------------------------------------------------
 * O QUE ISTO SUBSTITUI
 * ------------------------------------------------------------------
 * Antes existiam três cópias de um `<input type="file">` montado na mão
 * (material de venda, anexos do lead e fotos do catálogo). Funcionavam no
 * navegador e **não existiam** no celular: no app das lojas, o botão de anexar
 * simplesmente não abriria nada.
 *
 * O `expo-document-picker` resolve os dois lados: no navegador ele monta o
 * mesmo `<input type="file">` (com tratamento de cancelamento e limpeza que as
 * cópias na mão não tinham), e no celular abre o seletor nativo — o que
 * finalmente permite anexar **PDF**, e não só foto da galeria.
 *
 * ------------------------------------------------------------------
 * POR QUE PDF IMPORTA AQUI
 * ------------------------------------------------------------------
 * O material de venda do corretor é planta, tabela de preço e book — quase tudo
 * PDF. O seletor de fotos (`expo-image-picker`) nunca daria conta disso, então
 * o caminho nativo antigo, além de parcial, era parcial justamente no formato
 * mais usado.
 */
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';

/** Um arquivo escolhido, já pronto para subir no Storage. */
export interface PickedFile {
  name: string;
  blob: Blob;
  contentType: string;
  size: number;
}

interface PickOptions {
  /** Deixa escolher vários de uma vez. */
  multiple?: boolean;
  /** Filtro de tipo, no formato MIME (`'image/*'`, `'application/pdf'`...). */
  type?: string | string[];
}

const isWeb = Platform.OS === 'web';

/**
 * O conteúdo do arquivo escolhido.
 *
 * No navegador o próprio seletor devolve o `File` original em `asset.file`, e
 * usar ele direto evita reprocessar a base64 do `uri` — o que dobraria a
 * memória à toa num arquivo de 35 MB.
 *
 * No celular o `uri` é um `file://` local (o seletor copia para o cache), e o
 * `fetch` lê esse caminho normalmente.
 */
async function toBlob(asset: DocumentPicker.DocumentPickerAsset): Promise<Blob | null> {
  if (isWeb && asset.file) return asset.file;
  try {
    const res = await fetch(asset.uri);
    return await res.blob();
  } catch {
    return null;
  }
}

function fallbackName(asset: DocumentPicker.DocumentPickerAsset, blob: Blob): string {
  if (asset.name) return asset.name;
  // Sem nome (acontece em alguns seletores do Android), o tipo salva o dia:
  // sem extensão o arquivo vira "desconhecido" na hora de abrir depois.
  const ext = (blob.type || '').split('/')[1] ?? 'dat';
  return `arquivo.${ext}`;
}

/**
 * Abre o seletor do aparelho.
 *
 * @returns lista vazia quando o corretor fecha sem escolher — cancelar não é
 * erro, e quem chama não precisa tratar isso de forma diferente.
 */
export async function pickFiles({ multiple = true, type = '*/*' }: PickOptions = {}): Promise<
  PickedFile[]
> {
  let result: DocumentPicker.DocumentPickerResult;
  try {
    result = await DocumentPicker.getDocumentAsync({
      type,
      multiple,
      // Precisa ser cópia local, senão o `fetch` não alcança o arquivo no
      // celular (o URI original costuma ser de um provedor sem permissão).
      copyToCacheDirectory: true,
    });
  } catch {
    return [];
  }

  if (result.canceled || !result.assets) return [];

  const out: PickedFile[] = [];
  for (const asset of result.assets) {
    const blob = await toBlob(asset);
    // Um arquivo ilegível não pode derrubar os outros da mesma seleção.
    if (!blob || blob.size === 0) continue;
    out.push({
      name: fallbackName(asset, blob),
      blob,
      contentType: asset.mimeType || blob.type || 'application/octet-stream',
      size: asset.size ?? blob.size,
    });
  }
  return out;
}

/** Atalho para os casos de uma imagem só (foto de perfil, capa, logo). */
export async function pickImage(): Promise<PickedFile | null> {
  const files = await pickFiles({ multiple: false, type: 'image/*' });
  return files[0] ?? null;
}
