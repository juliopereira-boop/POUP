# Logotipos dos bancos

Coloque aqui o arquivo oficial de cada instituição, em PNG com fundo
transparente, quadrado, com pelo menos 256 × 256 px:

```
assets/bancos/caixa.png
assets/bancos/bb.png
assets/bancos/itau.png
assets/bancos/bradesco.png
assets/bancos/santander.png
```

O nome do arquivo é o `id` do banco em `src/features/financiamento/bancos.ts`.

Depois de colocar o arquivo, acrescente a linha correspondente ao mapa `LOGOS`
em `src/components/BancoMarca.tsx`:

```ts
const LOGOS: Record<string, ImageSourcePropType> = {
  bb: require('../../assets/bancos/bb.png'),
  bradesco: require('../../assets/bancos/bradesco.png'),
  santander: require('../../assets/bancos/santander.png'),
  itau: require('../../assets/bancos/itau.png'),
};
```

O selo passa a usar a imagem sozinho.

## Por que o mapa não vem preenchido

`require` de arquivo inexistente **quebra o build inteiro**. Enquanto o arquivo
não estiver aqui, a linha não pode existir no mapa — um deploy derrubado por
causa de um logotipo seria o pior negócio possível.

## Por que só a Caixa já tem marca sem arquivo

O símbolo da Caixa é geometria exata — quatro paralelogramos formando um X —, e
está desenhado em SVG dentro do `BancoMarca`, fiel em qualquer tamanho. As
marcas do Bradesco e do Santander têm traço orgânico e a do Banco do Brasil é um
entrelaçado complexo: reproduzi-las à mão sairia parecido e errado, o que
identifica pior do que o ladrilho com o nome. Para elas, o caminho é o arquivo
oficial.

## Uso da marca

Os logotipos são marca registrada de cada instituição. Use apenas a arte que
você estiver autorizado a utilizar — em geral, o material que o banco fornece ao
correspondente ou ao parceiro credenciado.
