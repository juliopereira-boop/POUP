/**
 * COMPARADOR DE CENÁRIOS.
 *
 * ===========================================================================
 * A CONVERSA QUE ESTA TELA RESOLVE
 * ===========================================================================
 * O cliente pergunta "e se eu pegar em 30 anos em vez de 35?" ou "qual a
 * diferença entre SAC e PRICE?". Hoje o corretor responde de cabeça, erra, e
 * perde a autoridade da conversa.
 *
 * Comparar é barato: o motor é uma função pura, então rodar quatro cenários é
 * rodar a mesma função quatro vezes. O que custa é ESCOLHER o que comparar — e
 * a resposta é: as duas variáveis que o cliente de fato controla, sistema e
 * prazo. Taxa ele não escolhe, valor do imóvel já está definido.
 *
 * ===========================================================================
 * O QUE A TABELA MOSTRA, E EM QUE ORDEM
 * ===========================================================================
 * Primeira parcela primeiro. É o número que decide a venda: o cliente compra o
 * que cabe no orçamento dele **este mês**. Juros totais vêm por último, porque
 * é o número que impressiona mas raramente muda a decisão — e porque um SAC
 * sempre ganha nele, o que faria a tabela parecer viciada se ele viesse no topo.
 */
import type { SistemaAmortizacao } from './amortizacao';
import type { Centavos } from './dinheiro';
import { simular, type EntradaSimulacao, type ResultadoSimulacao } from './motor';
import type { VersaoRegras } from './regras';

export interface Cenario {
  id: string;
  rotulo: string;
  sistema: SistemaAmortizacao;
  prazoMeses: number;
  resultado: ResultadoSimulacao;
}

export interface LinhaComparativo {
  chave: string;
  rotulo: string;
  /** Um valor por cenário, na mesma ordem. `null` = não calculado. */
  valores: (Centavos | number | string | null)[];
  formato: 'dinheiro' | 'numero' | 'texto' | 'percentual';
  /** `menor` = quem tem o menor valor está melhor. */
  melhor: 'menor' | 'maior' | 'nenhum';
}

/**
 * Monta os cenários variando sistema e prazo sobre a MESMA entrada.
 *
 * Cenário que o motor recusar (prazo acima do máximo da linha, por exemplo)
 * simplesmente não entra na lista — comparar com um cenário impossível seria
 * oferecer ao cliente uma opção que o banco vai negar.
 */
export function montarCenarios(
  base: EntradaSimulacao,
  regras: VersaoRegras,
  variacoes: { sistema: SistemaAmortizacao; prazoMeses: number }[],
): Cenario[] {
  const saida: Cenario[] = [];
  for (const v of variacoes) {
    const r = simular({ ...base, sistema: v.sistema, prazoMeses: v.prazoMeses }, regras);
    if (!r.ok) continue;
    saida.push({
      id: `${v.sistema}-${v.prazoMeses}`,
      rotulo: `${v.sistema} · ${Math.round(v.prazoMeses / 12)} anos`,
      sistema: v.sistema,
      prazoMeses: v.prazoMeses,
      resultado: r.resultado,
    });
  }
  return saida;
}

/**
 * As variações padrão: os dois sistemas nos dois prazos mais comuns.
 *
 * O prazo cheio vem do que o corretor pediu; o alternativo é ele menos cinco
 * anos, que é a pergunta que o cliente faz. Prazos acima do máximo da linha são
 * descartados por `montarCenarios`.
 */
export function variacoesPadrao(prazoBaseMeses: number) {
  const alternativo = Math.max(12, prazoBaseMeses - 60);
  const prazos = alternativo === prazoBaseMeses ? [prazoBaseMeses] : [prazoBaseMeses, alternativo];
  const saida: { sistema: SistemaAmortizacao; prazoMeses: number }[] = [];
  for (const p of prazos) {
    saida.push({ sistema: 'SAC', prazoMeses: p });
    saida.push({ sistema: 'PRICE', prazoMeses: p });
  }
  return saida;
}

export function compararCenarios(cenarios: Cenario[]): LinhaComparativo[] {
  const r = (f: (c: Cenario) => Centavos | number | string | null) => cenarios.map(f);

  return [
    {
      chave: 'primeira',
      rotulo: 'Primeira parcela',
      valores: r((c) => c.resultado.primeira?.prestacaoTotal ?? null),
      formato: 'dinheiro',
      melhor: 'menor',
    },
    {
      chave: 'ultima',
      rotulo: 'Última parcela',
      valores: r((c) => c.resultado.ultima?.prestacaoTotal ?? null),
      formato: 'dinheiro',
      melhor: 'menor',
    },
    {
      chave: 'renda',
      rotulo: 'Renda mínima estimada',
      valores: r((c) => c.resultado.rendaMinimaEstimada),
      formato: 'dinheiro',
      melhor: 'menor',
    },
    {
      chave: 'entrada',
      rotulo: 'Entrada total',
      valores: r((c) => c.resultado.entradaTotal),
      formato: 'dinheiro',
      melhor: 'nenhum',
    },
    {
      chave: 'financiado',
      rotulo: 'Valor financiado',
      valores: r((c) => c.resultado.valorFinanciado),
      formato: 'dinheiro',
      melhor: 'nenhum',
    },
    {
      chave: 'prazo',
      rotulo: 'Prazo (meses)',
      valores: r((c) => c.prazoMeses),
      formato: 'numero',
      melhor: 'nenhum',
    },
    {
      chave: 'juros',
      rotulo: 'Juros totais',
      valores: r((c) => c.resultado.totalJuros),
      formato: 'dinheiro',
      melhor: 'menor',
    },
    {
      chave: 'seguros',
      rotulo: 'Seguros no contrato',
      valores: r((c) => c.resultado.totalSeguros),
      formato: 'dinheiro',
      melhor: 'menor',
    },
    {
      chave: 'total',
      rotulo: 'Total pago',
      valores: r((c) => c.resultado.totalPago),
      formato: 'dinheiro',
      melhor: 'menor',
    },
    {
      chave: 'enquadramento',
      rotulo: 'Enquadramento estimado',
      valores: r((c) => (c.resultado.elegibilidade.elegivel ? 'Apto' : 'Não enquadra')),
      formato: 'texto',
      melhor: 'nenhum',
    },
  ];
}

/**
 * Qual coluna vence numa linha. Devolve os índices — plural, porque empate
 * existe e destacar um só seria mentira.
 */
export function vencedores(linha: LinhaComparativo): number[] {
  if (linha.melhor === 'nenhum') return [];
  const numeros = linha.valores.map((v) => (typeof v === 'number' ? v : null));
  const validos = numeros.filter((n): n is number => n !== null);
  if (validos.length < 2) return [];
  const alvo = linha.melhor === 'menor' ? Math.min(...validos) : Math.max(...validos);
  const saida: number[] = [];
  numeros.forEach((n, i) => {
    if (n === alvo) saida.push(i);
  });
  return saida;
}
