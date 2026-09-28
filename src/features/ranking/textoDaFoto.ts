/**
 * O TEXTO DA FOTO (comprovante ou documento do cliente) — tirado pelo próprio celular.
 *
 * iPhone: Apple Vision; Android: ML Kit (via `expo-text-extractor`). Tudo no
 * aparelho, sem IA generativa e sem serviço de fora. O texto vai para a Edge
 * Function `conferir-comprovante`, que tira dele as datas e os valores; quem
 * decide se a venda está comprovada é o banco.
 *
 * O módulo nativo é carregado só na hora (`import()`): num app instalado antes
 * dele existir (build antigo), a importação no topo derrubaria a tela da venda
 * — assim, só não há texto, e a venda fica em conferência para a auditoria.
 * Na web não existe: devolve `null`.
 */
import { File as ArquivoLocal, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

const MAX_TEXTO = 20_000;

async function lerImagem(uri: string): Promise<string> {
  const modulo = await import('expo-text-extractor');
  if (!modulo.isSupported) return '';
  const linhas = await modulo.extractTextFromImage(uri);
  return linhas.join('\n').trim();
}

/**
 * Foto da câmera costuma vir "deitada" nos metadados (EXIF) — o leitor do
 * sistema recebe a imagem de lado e não acha o texto. Por isso: primeiro a
 * foto é redesenhada em pé (e reduzida, que lê mais rápido); se ainda assim
 * sair pouco texto, tenta virada 90° para cada lado e fica com a melhor.
 */
export async function textoDaFoto(uri: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    let base = uri;
    try {
      const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');
      const emPe = await manipulateAsync(uri, [], { format: SaveFormat.JPEG, compress: 0.92 });
      base = emPe.width > 2200 ? (await manipulateAsync(emPe.uri, [{ resize: { width: 2200 } }], { format: SaveFormat.JPEG, compress: 0.92 })).uri : emPe.uri;
    } catch {
      /* sem o manipulador, lê a original */
    }
    let melhor = await lerImagem(base);
    if (melhor.replace(/\s/g, '').length < 40) {
      try {
        const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');
        for (const graus of [90, -90]) {
          const virada = await manipulateAsync(base, [{ rotate: graus }], { format: SaveFormat.JPEG, compress: 0.9 });
          const texto = await lerImagem(virada.uri);
          if (texto.length > melhor.length) melhor = texto;
        }
      } catch {
        /* fica com o que leu */
      }
    }
    return melhor ? melhor.slice(0, MAX_TEXTO) : null;
  } catch {
    return null;
  }
}

/** Para conferir de novo uma foto que já está no servidor: baixa e lê. */
export async function textoDaFotoNoLink(url: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const destino = new ArquivoLocal(Paths.cache, `comprovante-${Date.now()}.jpg`);
    const baixado = await ArquivoLocal.downloadFileAsync(url, destino);
    try {
      return await textoDaFoto(baixado.uri);
    } finally {
      try {
        baixado.delete();
      } catch {
        /* cache: o sistema limpa */
      }
    }
  } catch {
    return null;
  }
}

/** O comprovante é foto (e não PDF), pelo nome guardado. */
export function ehFoto(pathOuNome: string): boolean {
  return /\.(jpe?g|png|heic|heif|webp)$/i.test(pathOuNome);
}
