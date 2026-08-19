/**
 * DINHEIRO, EM CENTAVOS INTEIROS.
 *
 * ===========================================================================
 * POR QUE NÃO DÁ PARA USAR `number` DE REAIS
 * ===========================================================================
 * `0.1 + 0.2 === 0.30000000000000004`. Num carrinho de compras isso é
 * curiosidade; numa tabela de 420 parcelas é um erro que se acumula. Some 420
 * juros calculados em ponto flutuante e o saldo devedor final não fecha em
 * zero — sai R$ 0,03 negativo, ou positivo, dependendo do arredondamento. E a
 * planilha que o corretor mostra ao cliente tem uma linha que não bate.
 *
 * A solução aqui é a mesma que todo sistema financeiro sério usa: **o dinheiro
 * é um inteiro de centavos**. `number` do JavaScript é exato para inteiros até
 * 2^53 — nove quatrilhões de centavos, ou noventa trilhões de reais. Não existe
 * financiamento habitacional que chegue perto disso, então somar e subtrair
 * centavos aqui é **matematicamente exato**, sem biblioteca nenhuma.
 *
 * ===========================================================================
 * ONDE O PONTO FLUTUANTE AINDA APARECE — E POR QUE TUDO BEM
 * ===========================================================================
 * Taxa de juros é fração, não dinheiro: `0,0074` ao mês não é um valor
 * monetário e não precisa ser exato até o último bit. O que precisa ser exato é
 * o RESULTADO em dinheiro. Por isso a regra é:
 *
 *   > toda multiplicação de dinheiro por taxa passa por `aplicarTaxa`, que
 *   > devolve **centavos inteiros já arredondados**.
 *
 * Nada no motor guarda "reais com decimais" em variável intermediária. O
 * arredondamento acontece uma vez, no ponto de conversão, e não se propaga.
 *
 * ===========================================================================
 * A ESTRATÉGIA DE ARREDONDAMENTO, DECLARADA
 * ===========================================================================
 * - **Meio para cima, afastando do zero** (`arredondar`): 0,5 centavo vira 1
 *   centavo. É o arredondamento comercial que o brasileiro espera, e o mesmo
 *   que a HP-12C e as planilhas usam por padrão.
 * - **Juros do mês**: arredondados a cada mês, ANTES de virar parcela. Não se
 *   acumula fração de centavo de um mês para o outro. É como o banco faz — o
 *   boleto é emitido em centavos, não em milésimos.
 * - **Divisão que não fecha** (`ratear`): o resto em centavos é distribuído um
 *   a um pelas primeiras parcelas. A soma das partes é SEMPRE igual ao todo.
 *   Sobrar um centavo no fim de uma tabela é o erro clássico deste domínio, e
 *   `ratear` existe para que ele não possa acontecer.
 */

/**
 * Dinheiro em centavos. Sempre inteiro, sempre exato.
 *
 * O tipo é marcado (`__centavos`) para o compilador reclamar quando alguém
 * passa reais onde se espera centavos — o erro mais caro possível aqui é o que
 * confunde as duas unidades por um fator de cem.
 */
export type Centavos = number & { readonly __centavos: unique symbol };

/** Constrói centavos a partir de um inteiro já em centavos. */
export function centavos(valor: number): Centavos {
  return arredondar(valor) as Centavos;
}

export const ZERO = centavos(0);

/** Meio para cima, afastando do zero. Ver a nota de arredondamento acima. */
export function arredondar(n: number): number {
  return n < 0 ? -Math.round(-n) : Math.round(n);
}

/** Reais (com decimais) → centavos. Ex.: 210000 → 21_000_000. */
export function reaisParaCentavos(reais: number): Centavos {
  if (!Number.isFinite(reais)) return ZERO;
  return centavos(reais * 100);
}

/** Centavos → reais, para exibir ou entregar a um gráfico. */
export function centavosParaReais(c: Centavos): number {
  return c / 100;
}

export function somar(...valores: Centavos[]): Centavos {
  let total = 0;
  for (const v of valores) total += v;
  return total as Centavos;
}

export function subtrair(a: Centavos, b: Centavos): Centavos {
  return (a - b) as Centavos;
}

/** Nunca deixa o valor ficar negativo. Usado onde negativo não faz sentido. */
export function naoNegativo(c: Centavos): Centavos {
  return (c < 0 ? 0 : c) as Centavos;
}

export function maior(a: Centavos, b: Centavos): Centavos {
  return (a > b ? a : b) as Centavos;
}

export function menor(a: Centavos, b: Centavos): Centavos {
  return (a < b ? a : b) as Centavos;
}

/**
 * Dinheiro × taxa → dinheiro, arredondado na hora.
 *
 * É o único lugar do motor onde uma taxa toca um valor monetário. Concentrar
 * isso numa função é o que garante que a política de arredondamento seja uma
 * só — espalhado, cada trecho arredondaria do seu jeito e as somas parariam de
 * fechar.
 */
export function aplicarTaxa(valor: Centavos, taxa: number): Centavos {
  if (!Number.isFinite(taxa)) return ZERO;
  return centavos(valor * taxa);
}

/** Percentual sobre um valor. `pct` em pontos percentuais (80 = 80%). */
export function percentualDe(valor: Centavos, pct: number): Centavos {
  return aplicarTaxa(valor, pct / 100);
}

/**
 * Divide `total` em `partes` pedaços que **somam exatamente `total`**.
 *
 * O resto da divisão inteira é distribuído um centavo por parcela, começando
 * pela primeira. Assim R$ 100,00 em 3 partes vira 33,34 / 33,33 / 33,33 — e
 * não 33,33 / 33,33 / 33,33 com um centavo evaporado.
 *
 * Distribuir no COMEÇO e não no fim é decisão consciente: o cliente olha a
 * primeira parcela e a última. Se o centavo sobrasse na última, a tabela
 * terminaria com um número diferente das outras justamente na linha que ele
 * confere com mais atenção.
 */
export function ratear(total: Centavos, partes: number): Centavos[] {
  if (partes <= 0) return [];
  const base = Math.trunc(total / partes);
  const resto = total - base * partes;
  const saida: Centavos[] = [];
  for (let i = 0; i < partes; i++) {
    saida.push((base + (i < resto ? 1 : 0)) as Centavos);
  }
  return saida;
}

/* ===========================================================================
 * TAXAS
 * ===========================================================================
 * Taxa é fração pura (0,0074 = 0,74%), nunca percentual, dentro do motor. A
 * conversão de "% ao ano" que o corretor lê para a fração mensal que a
 * matemática usa acontece nas duas funções abaixo — e em nenhum outro lugar.
 */

/** Como uma taxa ao ano vira taxa ao mês. */
export type ConversaoTaxa = 'composta' | 'linear';

/**
 * Taxa anual (em % ao ano) → taxa mensal (fração).
 *
 * `composta` — `(1 + ia)^(1/12) − 1`. É a conversão que preserva a taxa
 * EFETIVA: doze meses compostos devolvem exatamente a taxa anual informada.
 *
 * `linear` — `ia / 12`. É a leitura NOMINAL, em que "12% ao ano" quer dizer
 * "1% ao mês" e o efetivo anual acaba maior (12,68%).
 *
 * As duas existem porque as duas são usadas no mercado brasileiro, e qual vale
 * **depende do contrato** — não é escolha nossa. Por isso a conversão é um
 * parâmetro da regra vigente (`conversaoTaxa`), e não uma constante escondida
 * aqui dentro. Escolher por conta própria seria inventar condição de
 * financiamento, que é justamente o que este módulo não faz.
 */
export function taxaAnualParaMensal(taxaAnualPct: number, conversao: ConversaoTaxa): number {
  const ia = taxaAnualPct / 100;
  if (ia <= 0) return 0;
  return conversao === 'linear' ? ia / 12 : Math.pow(1 + ia, 1 / 12) - 1;
}

/** Taxa mensal (fração) → taxa anual efetiva em %. Só para exibir. */
export function taxaMensalParaAnualEfetiva(taxaMensal: number): number {
  if (taxaMensal <= 0) return 0;
  return (Math.pow(1 + taxaMensal, 12) - 1) * 100;
}

/* ===========================================================================
 * EXIBIÇÃO
 * ===========================================================================
 * Fica aqui, junto do tipo, porque quem tem `Centavos` na mão quase sempre
 * precisa mostrá-lo — e obrigar cada tela a lembrar de dividir por cem é
 * garantir que uma delas vai esquecer.
 */

export function formatarBRL(c: Centavos): string {
  const negativo = c < 0;
  const abs = Math.abs(c);
  const inteiros = Math.trunc(abs / 100);
  const cents = abs % 100;
  const comPontos = String(inteiros).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negativo ? '-' : ''}R$ ${comPontos},${String(cents).padStart(2, '0')}`;
}

/** "1,2%" — para taxa em pontos percentuais. */
export function formatarPct(pct: number, casas = 2): string {
  return `${pct.toFixed(casas).replace('.', ',')}%`;
}

/** "35 anos (420 meses)" — o corretor pensa em anos, o contrato em meses. */
export function formatarPrazo(meses: number): string {
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  if (anos === 0) return `${meses} ${meses === 1 ? 'mês' : 'meses'}`;
  const parteAnos = `${anos} ${anos === 1 ? 'ano' : 'anos'}`;
  if (resto === 0) return `${parteAnos} (${meses} meses)`;
  return `${parteAnos} e ${resto} ${resto === 1 ? 'mês' : 'meses'} (${meses} meses)`;
}
