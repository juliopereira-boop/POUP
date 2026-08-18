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
// `File` do expo-file-system tem o MESMO NOME do `File` do navegador.
import { File as ArquivoLocal } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Platform } from 'react-native';

import type { UploadBody } from '@/data';

/** Um arquivo escolhido, já pronto para subir no Storage. */
export interface PickedFile {
  name: string;
  /**
   * O conteúdo. `Blob` na web, `ArrayBuffer` no celular — a razão está em
   * `UploadBody` (`src/data/types.ts`): no React Native o `supabase-js`
   * embrulha `Blob` em `FormData`, que não sabe serializá-lo, e o upload sobe
   * vazio sem devolver erro nenhum.
   */
  body: UploadBody;
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
 * Lê o arquivo de um `file://` local como `ArrayBuffer`.
 *
 * Este é o caminho do CELULAR, e ele existe por um motivo específico: enviar
 * `Blob` no React Native produz um upload vazio, sem erro (ver `UploadBody`).
 * `ArrayBuffer` é o formato que a própria documentação do `supabase-js` manda
 * usar aqui.
 *
 * `expo-file-system` lê os bytes direto do disco. O caminho antigo era
 * `fetch(uri).blob()` — que além de devolver a forma errada, passava pelo
 * empilhamento de rede à toa para ler um arquivo local.
 */
async function bytesFromUri(uri: string): Promise<ArrayBuffer | null> {
  try {
    const bytes = await new ArquivoLocal(uri).bytes();
    // `.buffer` pode ser maior que a visão (offset/tamanho). O `slice` garante
    // que só os bytes DESTE arquivo sejam enviados.
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  } catch {
    return null;
  }
}

/**
 * O conteúdo do arquivo escolhido, na forma que a plataforma aceita.
 *
 * No navegador o próprio seletor devolve o `File` original em `asset.file`, e
 * usar ele direto evita reprocessar a base64 do `uri` — o que dobraria a
 * memória à toa num arquivo de 35 MB.
 */
async function toBody(asset: DocumentPicker.DocumentPickerAsset): Promise<UploadBody | null> {
  if (isWeb) return asset.file ?? null;
  return bytesFromUri(asset.uri);
}

function bodySize(body: UploadBody): number {
  return body instanceof ArrayBuffer ? body.byteLength : body.size;
}

function fallbackName(asset: DocumentPicker.DocumentPickerAsset, contentType: string): string {
  if (asset.name) return asset.name;
  // Sem nome (acontece em alguns seletores do Android), o tipo salva o dia:
  // sem extensão o arquivo vira "desconhecido" na hora de abrir depois.
  const ext = contentType.split('/')[1] ?? 'dat';
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
    const body = await toBody(asset);
    // Um arquivo ilegível não pode derrubar os outros da mesma seleção.
    if (!body || bodySize(body) === 0) continue;
    const contentType =
      asset.mimeType || (body instanceof Blob ? body.type : '') || 'application/octet-stream';
    out.push({
      name: fallbackName(asset, contentType),
      body,
      contentType,
      size: asset.size ?? bodySize(body),
    });
  }
  return out;
}

/* ===========================================================================
 * IMAGENS
 * ===========================================================================
 * O seletor de ARQUIVOS não é o seletor de FOTOS, e no celular a diferença é
 * grande: `expo-document-picker` abre o gerenciador de arquivos (Downloads,
 * Documentos, Drive) — no iPhone é o app Arquivos, que nem mostra o rolo da
 * câmera. Para escolher a foto de uma construtora, era o lugar errado: a foto
 * quase sempre está na galeria, e chegar nela pelo gerenciador de arquivos
 * exige saber navegar até a pasta certa.
 *
 * Por isso a imagem passou a ter os dois caminhos, e o corretor escolhe:
 * galeria (`expo-image-picker`) ou arquivos (`expo-document-picker`).
 * "Arquivos" continua existindo porque logo de construtora costuma chegar como
 * PNG baixado — no iPhone isso vai para o app Arquivos e nunca aparece em
 * Fotos.
 *
 * Na WEB não existe essa divisão: o `<input type="file" accept="image/*">` do
 * navegador já oferece galeria, câmera e arquivos em um menu só, feito pelo
 * próprio sistema. Perguntar ali seria inventar uma escolha que o navegador já
 * faz melhor.
 */

/** De onde a imagem vem. */
export type ImageOrigin = 'galeria' | 'arquivos';

interface PickImageOptions {
  /**
   * Pede o recorte quadrado antes de devolver.
   *
   * Vale para foto que será exibida redonda (construtora, empreendimento): sem
   * o recorte, uma foto deitada entra no círculo cortada pelo meio, e o
   * corretor não tem como consertar. Só funciona no caminho da galeria — o
   * gerenciador de arquivos não tem editor.
   */
  square?: boolean;
}

/** Converte o que o seletor de fotos devolve no mesmo formato do de arquivos. */
async function fromGallery(square: boolean): Promise<PickedFile | null> {
  /*
   * Permissão só no Android. No iOS o seletor moderno roda fora do app e não
   * exige autorização nenhuma — pedir ali abriria, à toa, o alerta de acesso
   * TOTAL à fototeca, que é justamente o que não se quer num app que precisa
   * de uma foto só.
   */
  if (Platform.OS === 'android') {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return null;
  }

  let result: ImagePicker.ImagePickerResult;
  try {
    result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: square,
      aspect: square ? [1, 1] : undefined,
      quality: 0.85,
    });
  } catch {
    return null;
  }

  const asset = result.canceled ? null : result.assets?.[0];
  if (!asset) return null;

  const body = await bytesFromUri(asset.uri);
  if (!body || body.byteLength === 0) return null;

  /*
   * `allowsEditing` reescreve a imagem, e o resultado do recorte sai em JPEG
   * mesmo quando o original era PNG. Confiar no `mimeType` do asset gravaria
   * `.png` num arquivo JPEG — o Storage serviria com o tipo errado e a foto
   * não abriria em alguns navegadores.
   */
  const contentType = square ? 'image/jpeg' : asset.mimeType || 'image/jpeg';
  return {
    name: asset.fileName || `foto.${contentType.split('/')[1] ?? 'jpg'}`,
    body,
    contentType,
    size: body.byteLength,
  };
}

/** Abre direto a origem pedida, sem perguntar. */
export async function pickImageFrom(
  origem: ImageOrigin,
  { square = false }: PickImageOptions = {},
): Promise<PickedFile | null> {
  if (origem === 'galeria' && !isWeb) return fromGallery(square);
  const files = await pickFiles({ multiple: false, type: 'image/*' });
  return files[0] ?? null;
}

/**
 * Pergunta de onde vem a imagem e abre o seletor correspondente.
 *
 * Três botões, não quatro: o `Alert` do Android só tem três lugares
 * (positivo/negativo/neutro) e descarta os excedentes em silêncio — um menu
 * que perde uma opção só no Android é pior do que um menu menor. A câmera
 * ficou de fora por isso e porque a foto tirada na hora cai na galeria de
 * qualquer forma, então ela continua a um toque de distância.
 */
export async function pickImage(options: PickImageOptions = {}): Promise<PickedFile | null> {
  if (isWeb) return pickImageFrom('arquivos', options);

  const origem = await new Promise<ImageOrigin | null>((resolve) => {
    Alert.alert(
      'Escolher imagem',
      'De onde você quer pegar a foto?',
      [
        { text: 'Galeria de fotos', onPress: () => resolve('galeria') },
        { text: 'Arquivos', onPress: () => resolve('arquivos') },
        // `onDismiss` não existe no iOS: tocar fora não fecha um Alert lá. O
        // `onPress` do cancelar cobre os dois sistemas.
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });

  if (!origem) return null;
  return pickImageFrom(origem, options);
}
