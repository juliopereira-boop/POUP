/**
 * INDEXADORES — TR, IPCA e prefixado.
 *
 * ===========================================================================
 * O QUE A ESPECIFICAÇÃO EXIGE, E O QUE FALTAVA NO MOTOR
 * ===========================================================================
 * §25 é explícito: em contrato indexado, **o saldo é atualizado ANTES de os
 * juros incidirem** —
 *
 *     saldo anterior → aplica índice → saldo atualizado → juros → amortização
 *
 * Isso não é detalhe de ordem. Aplicar o índice depois dos juros faz o
 * financiamento inteiro sair menor, e a diferença cresce com o prazo: em 420
 * meses com TR de 0,1% a.m., a ordem errada subestima o total pago em dezenas
 * de milhares de reais.
 *
 * §27 fecha o outro lado: no PREFIXADO **não se aplica índice nenhum**. TR e
 * IPCA não entram, e o saldo só cai por amortização.
 *
 * ===========================================================================
 * SIMULAÇÃO NÃO É PROJEÇÃO — §110 e §111
 * ===========================================================================
 * TR e IPCA **futuros não existem**. Ninguém sabe quanto a TR vai render no mês
 * 217. Então este módulo distingue duas coisas, e a distinção viaja até o PDF:
 *
 *   **taxa observada** — o índice divulgado pela fonte oficial (Banco Central
 *     para TR/SELIC, IBGE para IPCA), cadastrado pelo administrador.
 *   **cenário hipotético** — um valor que o CORRETOR escolhe para ver o efeito
 *     ("e se a TR ficar em 0,1%?"). O resultado é marcado como PROJEÇÃO e
 *     nunca como condição.
 *
 * §109 é taxativo: "não utilizar previsão de IPCA como se fosse índice
 * efetivamente observado".
 *
 * ===========================================================================
 * E QUANDO NÃO HÁ NEM UM NEM OUTRO
 * ===========================================================================
 * O cronograma sai **sem correção**, com aviso. Não se inventa um índice para
 * a tabela ficar bonita: uma tabela sem correção declarada é honesta; uma com
 * correção inventada é uma mentira com aparência de contrato.
 */
import type { Parametro } from './regras';
import { temValor } from './regras';

/** `nenhum` é o prefixado: o saldo não recebe correção. */
export type TipoIndexador = 'nenhum' | 'mensal';

export interface Indexador {
  id: string;
  nome: string;
  descricao: string;
  tipo: TipoIndexador;
  /**
   * Correção mensal, em fração (0,001 = 0,1% a.m.).
   *
   * Nasce pendente para TR, IPCA e poupança: é dado de fonte externa (Banco
   * Central, IBGE), não é regra da CAIXA, e projetá-lo é previsão econômica.
   */
  taxaMensal: Parametro<number>;
  /** De onde o índice vem, para o corretor saber o que está lendo. */
  fonteOficial: string | null;
}

/** Como a correção do mês foi obtida — e é isso que classifica o resultado. */
export type OrigemCorrecao = 'sem_correcao' | 'observada' | 'cenario';

export interface CorrecaoAplicada {
  /** Fração ao mês. Zero quando não há correção. */
  taxaMensal: number;
  origem: OrigemCorrecao;
  /** Frase pronta para a tela e para o rodapé do PDF. */
  explicacao: string;
}

export interface EscolhaDeIndexador {
  indexador: Indexador | null;
  /**
   * Cenário hipotético escolhido pelo corretor, em % ao mês. `null` = usar o
   * índice cadastrado, se houver.
   */
  cenarioMensalPct?: number | null;
}

/**
 * Resolve qual correção o cronograma vai aplicar, e por quê.
 *
 * A ordem de precedência é deliberada: **o cenário do corretor ganha do índice
 * cadastrado**. Ele escolheu explicitamente ver "e se a TR for 0,2%" — ignorar
 * isso em favor do valor de tabela seria desobedecer ao usuário. Mas o
 * resultado passa a ser rotulado como projeção, e o rótulo acompanha o número
 * até o PDF.
 */
export function resolverCorrecao(escolha: EscolhaDeIndexador): CorrecaoAplicada {
  const idx = escolha.indexador;

  if (!idx || idx.tipo === 'nenhum') {
    return {
      taxaMensal: 0,
      origem: 'sem_correcao',
      explicacao:
        'Contrato prefixado: o saldo devedor não é corrigido por TR nem por IPCA. A parcela só varia pelo sistema de amortização.',
    };
  }

  const cenario = escolha.cenarioMensalPct;
  if (typeof cenario === 'number' && Number.isFinite(cenario) && cenario > 0) {
    return {
      taxaMensal: cenario / 100,
      origem: 'cenario',
      explicacao: `Cenário hipotético: ${idx.nome} a ${fmt(cenario)}% ao mês. Não é o índice observado — é uma projeção para você ver o efeito.`,
    };
  }

  if (temValor(idx.taxaMensal) && idx.taxaMensal.valor > 0) {
    const pct = idx.taxaMensal.valor * 100;
    return {
      taxaMensal: idx.taxaMensal.valor,
      origem: 'observada',
      explicacao: `${idx.nome} a ${fmt(pct)}% ao mês, do índice cadastrado${idx.fonteOficial ? ` (fonte: ${idx.fonteOficial})` : ''}.`,
    };
  }

  return {
    taxaMensal: 0,
    origem: 'sem_correcao',
    explicacao: `A tabela sai SEM correção pelo ${idx.nome}: o índice não está cadastrado e projetá-lo seria previsão econômica, não condição de contrato. Num contrato indexado o saldo devedor sobe com o índice — o valor real será maior.`,
  };
}

function fmt(n: number): string {
  return n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',');
}

/**
 * Os cenários que a tela oferece quando não há índice cadastrado.
 *
 * Três valores redondos, incluindo o zero. O zero primeiro de propósito: é o
 * padrão, é o único que não é chute, e deixar um valor positivo como padrão
 * faria o corretor apresentar uma projeção achando que era a condição.
 */
export const CENARIOS_INDEXADOR = [
  { value: '0', label: 'Sem correção (0% a.m.)' },
  { value: '0.05', label: 'Cenário: 0,05% a.m.' },
  { value: '0.1', label: 'Cenário: 0,1% a.m.' },
  { value: '0.2', label: 'Cenário: 0,2% a.m.' },
  { value: '0.4', label: 'Cenário: 0,4% a.m.' },
];
