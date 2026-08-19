/**
 * O SELO DO BANCO.
 *
 * ===========================================================================
 * POR QUE UM SELO DESENHADO, E NÃO UM ARQUIVO DE LOGO
 * ===========================================================================
 * A logomarca de um banco é marca registrada dele. Reproduzir o arquivo
 * original dentro do POUP exigiria a arte oficial e a licença de uso — que
 * quem tem é o corretor credenciado, não este repositório.
 *
 * Então este componente desenha um selo de **identificação nominativa**: a cor
 * institucional e o nome do banco escritos por extenso. É o suficiente para o
 * corretor bater o olho e saber onde está — que é o objetivo — sem falsificar
 * uma arte que não é nossa.
 *
 * ===========================================================================
 * COMO TROCAR PELO LOGO OFICIAL
 * ===========================================================================
 * Quem tiver a arte licenciada põe o PNG em `assets/bancos/<id>.png` e
 * acrescenta uma linha ao mapa `LOGOS` abaixo:
 *
 *     const LOGOS: Record<string, ImageSourcePropType> = {
 *       caixa: require('../../assets/bancos/caixa.png'),
 *     };
 *
 * O componente passa a usar a imagem sozinho, sem mais nenhuma mudança. O mapa
 * nasce vazio de propósito: um `require` para um arquivo que não existe quebra
 * o build inteiro, e um build quebrado por causa de um logo seria o pior
 * negócio possível.
 */
import { Image, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';

import type { Banco } from '@/features/financiamento/bancos';
import { radius, typography } from '@/theme';

const LOGOS: Record<string, ImageSourcePropType> = {};

interface Props {
  banco: Banco;
  /** Lado do selo em pixels. */
  tamanho?: number;
}

export function BancoMarca({ banco, tamanho = 52 }: Props) {
  const logo = LOGOS[banco.id];

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
      {logo ? (
        <Image
          source={logo}
          style={{ width: tamanho * 0.72, height: tamanho * 0.72 }}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text
          style={[estilos.sigla, { color: banco.corTexto, fontSize: fonte, lineHeight: fonte * 1.2 }]}
          numberOfLines={1}
        >
          {banco.sigla}
        </Text>
      )}
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
  sigla: {
    ...typography.label,
    fontWeight: '800',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
});
