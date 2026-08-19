/**
 * O SELO DO BANCO.
 *
 * ===========================================================================
 * TRÊS CAMINHOS, NESTA ORDEM
 * ===========================================================================
 * 1. **Arquivo oficial**, se estiver no repositório — é o ideal, e quem tem a
 *    arte licenciada só precisa acrescentar uma linha ao mapa `LOGOS`.
 * 2. **Marca desenhada**, para os bancos cujo símbolo é geometria pura e pode
 *    ser reproduzido com fidelidade em SVG. Hoje: a Caixa.
 * 3. **Ladrilho com o nome**, na cor institucional. É identificação
 *    nominativa, não é falsificação de arte de ninguém.
 *
 * ===========================================================================
 * POR QUE O MAPA `LOGOS` NASCE VAZIO
 * ===========================================================================
 * `require` de arquivo que não existe **quebra o build inteiro** — e um build
 * quebrado por causa de um logotipo seria o pior negócio possível. Então o
 * mapa fica vazio e o caminho está documentado:
 *
 *     1. ponha o arquivo em `assets/bancos/<id>.png`
 *     2. acrescente a linha correspondente aqui:
 *
 *        const LOGOS: Record<string, ImageSourcePropType> = {
 *          bb: require('../../assets/bancos/bb.png'),
 *          bradesco: require('../../assets/bancos/bradesco.png'),
 *          santander: require('../../assets/bancos/santander.png'),
 *          itau: require('../../assets/bancos/itau.png'),
 *        };
 *
 * O componente passa a usar a imagem sozinho, e o ladrilho some.
 *
 * Os `id` são os de `src/features/financiamento/bancos.ts`: `caixa`, `bb`,
 * `itau`, `bradesco`, `santander`.
 */
import { Image, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import type { Banco } from '@/features/financiamento/bancos';
import { radius, typography } from '@/theme';

const LOGOS: Record<string, ImageSourcePropType> = {};

/**
 * A MARCA DA CAIXA — quatro paralelogramos formando um X.
 *
 * O símbolo é geometria exata: dois paralelogramos brancos e dois laranjas
 * cruzando sobre o azul institucional. Reproduzi-lo em `Path` é desenhar as
 * mesmas quatro figuras — não é aproximar um traço orgânico, e por isso sai
 * fiel em qualquer tamanho e sem arquivo de imagem.
 *
 * A caixa de coordenadas é 100 × 100; o `Rect` de fundo já traz o azul, então
 * o selo dispensa a moldura colorida do ladrilho.
 */
function MarcaCaixa({ tamanho }: { tamanho: number }) {
  const AZUL = '#0B5CA8';
  const LARANJA = '#F26522';
  const BRANCO = '#FFFFFF';
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 100 100">
      <Rect x="0" y="0" width="100" height="100" rx="18" fill={AZUL} />
      {/* superior esquerdo, branco: desce da esquerda para o centro */}
      <Path d="M20 16 H44 L62 50 H38 Z" fill={BRANCO} />
      {/* superior direito, laranja: desce do centro para a direita */}
      <Path d="M56 16 H80 L62 50 H38 Z" fill={LARANJA} />
      {/* inferior esquerdo, laranja: do centro desce para a esquerda */}
      <Path d="M38 50 H62 L44 84 H20 Z" fill={LARANJA} />
      {/* inferior direito, branco: do centro desce para a direita */}
      <Path d="M38 50 H62 L80 84 H56 Z" fill={BRANCO} />
    </Svg>
  );
}

const DESENHADAS: Record<string, (p: { tamanho: number }) => React.ReactElement> = {
  caixa: MarcaCaixa,
};

interface Props {
  banco: Banco;
  /** Lado do selo em pixels. */
  tamanho?: number;
}

export function BancoMarca({ banco, tamanho = 52 }: Props) {
  const logo = LOGOS[banco.id];
  if (logo) {
    return (
      <View
        style={[estilos.moldura, { width: tamanho, height: tamanho, borderRadius: radius.md }]}
        accessible
        accessibilityRole="image"
        accessibilityLabel={banco.nome}
      >
        <Image
          source={logo}
          style={{ width: tamanho, height: tamanho }}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      </View>
    );
  }

  const Desenhada = DESENHADAS[banco.id];
  if (Desenhada) {
    return (
      <View accessible accessibilityRole="image" accessibilityLabel={banco.nome}>
        <Desenhada tamanho={tamanho} />
      </View>
    );
  }

  /*
   * O corpo da sigla encolhe conforme ela cresce: "BB" cabe grande, "Santander"
   * não cabe de jeito nenhum no mesmo tamanho. Sem isto, o nome do banco sai
   * cortado — e um selo com o nome cortado identifica pior que nenhum selo.
   */
  const fonte = Math.max(9, Math.min(tamanho / 3.2, (tamanho * 1.55) / banco.sigla.length));

  return (
    <View
      style={[
        estilos.selo,
        { width: tamanho, height: tamanho, borderRadius: radius.md, backgroundColor: banco.cor },
      ]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={banco.nome}
    >
      <Text
        style={[estilos.sigla, { color: banco.corTexto, fontSize: fonte, lineHeight: fonte * 1.2 }]}
        numberOfLines={1}
      >
        {banco.sigla}
      </Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  selo: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    overflow: 'hidden',
  },
  moldura: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sigla: {
    ...typography.label,
    fontWeight: '800',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
});
