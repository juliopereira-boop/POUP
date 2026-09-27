/**
 * O TEXTO DA FOTO DO COMPROVANTE — tirado pelo próprio celular.
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

export async function textoDaFoto(uri: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const modulo = await import('expo-text-extractor');
    if (!modulo.isSupported) return null;
    const linhas = await modulo.extractTextFromImage(uri);
    const texto = linhas.join('\n').trim();
    return texto ? texto.slice(0, MAX_TEXTO) : null;
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
