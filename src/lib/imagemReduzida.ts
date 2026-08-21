/**
 * REDUZIR A FOTO ANTES DE MANDAR PARA A IA.
 *
 * ===========================================================================
 * POR QUE REDUZIR, SE A API JÁ REDUZ
 * ===========================================================================
 * A API da Anthropic reduz a imagem para 1568 px no lado maior antes de cobrar
 * tokens. Ou seja: mandar 4000 px **não custa mais token** do que mandar 1568.
 * Então o motivo aqui não é o preço do modelo — é tudo o que vem antes dele.
 *
 * Uma foto de celular moderno tem 3 a 6 MB. Em base64 isso vira 4 a 8 MB de
 * texto, que precisam:
 *
 *   1. **subir pelo 4G do corretor**, dentro de um carro, na porta do
 *      empreendimento, com o cliente esperando. É o passo mais lento e o que
 *      mais falha;
 *   2. entrar inteiro na memória da Edge Function, que tem limite;
 *   3. passar pelo teto de bytes da própria função (ver `scan-document`).
 *
 * Reduzir para 1600 px com compressão 0.7 deixa a mesma foto em algo entre 150
 * e 400 KB. O documento continua perfeitamente legível — CNH e RG têm texto
 * grande — e o upload deixa de ser o gargalo.
 *
 * ===========================================================================
 * 1600 px, E NÃO 1568
 * ===========================================================================
 * O limite da API é o lado maior; 1600 é o número redondo logo acima, e a
 * diferença de 32 px não muda nem o custo nem a leitura. Redondo é melhor
 * porque é o número que alguém vai reler daqui a um ano e entender de primeira.
 *
 * ===========================================================================
 * SE A REDUÇÃO FALHAR, MANDA O ORIGINAL
 * ===========================================================================
 * Uma foto grande que funciona é melhor do que uma leitura que não acontece. A
 * redução é otimização, não requisito: qualquer erro aqui cai de volta no
 * original e o teto de bytes da Edge Function segue como rede de proteção.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** Lado maior, em pixels, depois da redução. */
export const LADO_MAXIMO = 1600;

/**
 * Compressão JPEG. 0.7 é o ponto em que o texto do documento continua nítido e
 * o arquivo já caiu para uma fração do original.
 */
const COMPRESSAO = 0.7;

export interface ImagemParaEnvio {
  base64: string;
  mimeType: string;
}

/**
 * Reduz a imagem apontada por `uri` e devolve base64 pronto para envio.
 *
 * `fallback` é o base64 que o seletor de imagem já entregou — usado quando a
 * redução falha, ou quando a imagem já é pequena o bastante para não valer o
 * trabalho.
 */
export async function reduzirParaEnvio(
  uri: string,
  fallback: ImagemParaEnvio,
): Promise<ImagemParaEnvio> {
  try {
    const contexto = ImageManipulator.manipulate(uri);
    const renderizada = await contexto.renderAsync();

    /*
     * Já é pequena: devolve o original. Recomprimir uma imagem que já cabe só
     * gastaria tempo e degradaria a leitura de graça.
     */
    if (renderizada.width <= LADO_MAXIMO && renderizada.height <= LADO_MAXIMO) {
      return fallback;
    }

    /*
     * Um lado só. `expo-image-manipulator` calcula o outro preservando a
     * proporção — passar os dois deformaria o documento, e documento deformado
     * é documento que o modelo lê errado.
     */
    const deitada = renderizada.width >= renderizada.height;
    const reduzida = await ImageManipulator.manipulate(uri)
      .resize(deitada ? { width: LADO_MAXIMO } : { height: LADO_MAXIMO })
      .renderAsync();

    const salva = await reduzida.saveAsync({
      base64: true,
      compress: COMPRESSAO,
      format: SaveFormat.JPEG,
    });

    if (!salva.base64) return fallback;
    return { base64: salva.base64, mimeType: 'image/jpeg' };
  } catch (e) {
    console.warn('Não foi possível reduzir a imagem; enviando o original.', (e as Error).message);
    return fallback;
  }
}
