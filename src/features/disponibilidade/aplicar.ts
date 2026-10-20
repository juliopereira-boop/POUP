/**
 * A DISPONIBILIDADE DO UAU SOBRE AS UNIDADES JÁ PRECIFICADAS — SEM TELA.
 *
 * Duas coisas entram em cada unidade:
 *
 *   1. A SITUAÇÃO (verde/amarelo/vermelho/cinza), pela chave do vínculo que o
 *      banco já resolveu. Unidade sem linha = sem cor, como era antes.
 *
 *   2. O VALOR DE VENDA, conforme a fonte escolhida pelo admin:
 *        automatico → a tabela de preço enviada, se houver; senão o UAU;
 *        tabela     → só a tabela (o UAU não mexe no preço);
 *        uau        → só o UAU (a tabela, se houver, ainda dá avaliação, área
 *                     e vaga — o UAU não tem esses dados).
 *
 * E uma regra de escolha: unidade VENDIDA ou FORA DE VENDA não pode ser
 * escolhida no simulador. Em negociação pode, com aviso (decisão do dono).
 */
import type { Disponibilidade, FonteDoPreco, SituacaoDaUnidade } from '@/data/types';
import type { PrecoDaUnidade } from '../tabelaPreco/preco';

/** Leitura mais velha que isto: a tela avisa que pode estar desatualizada. */
export const PRAZO_FRESCOR_MS = 3 * 60 * 1000;

export function fonteEfetiva(fonte: FonteDoPreco, temTabela: boolean): 'tabela' | 'uau' {
  if (fonte === 'automatico') return temTabela ? 'tabela' : 'uau';
  return fonte;
}

/** O mínimo que a unidade precisa ter (a saída de `precificarBlocos`). */
interface UnidadeBase {
  id: string;
  preco: PrecoDaUnidade;
  valorDeVenda: number | null;
  vaga: 'carro' | 'moto' | null;
  ventilacao: 'mais' | 'menos' | null;
}

export type ComDisponibilidade<U> = U & {
  /** `null` = sem informação do UAU (grade sem cor nesta unidade). */
  situacao: Exclude<SituacaoDaUnidade, 'sem_vinculo'> | null;
  statusDescricao: string | null;
};

export function aplicarNaUnidade<U extends UnidadeBase>(
  u: U,
  disp: Disponibilidade | null,
  temTabela: boolean,
): ComDisponibilidade<U> {
  const d = disp?.temUau ? disp.unidades.get(u.id) : undefined;
  const situacao = d && d.situacao !== 'sem_vinculo' ? d.situacao : null;
  const base = { ...u, situacao, statusDescricao: situacao ? (d?.statusDescricao ?? null) : null };
  if (!disp?.temUau || fonteEfetiva(disp.fontePreco, temTabela) !== 'uau') return base;

  // Preço do UAU. Sem valor no UAU, a unidade fica sem preço (não herda o da tabela).
  const valor = situacao ? (d?.valorUau ?? null) : null;
  if (valor == null || !(valor > 0)) {
    return {
      ...base,
      valorDeVenda: null,
      preco: { ok: false, motivo: 'sem_linha', mensagem: 'O UAU não tem valor de venda para esta unidade.' },
    };
  }
  const daTabela = u.preco.ok ? u.preco : null;
  return {
    ...base,
    valorDeVenda: valor,
    preco: {
      ok: true,
      venda: valor,
      avaliacao: daTabela?.avaliacao ?? null,
      areaM2: daTabela?.areaM2 ?? null,
      vaga: u.vaga,
      ventilacao: u.ventilacao,
      regra: null,
      origem: 'uau',
    },
  };
}

export function aplicarNosBlocos<B extends { unidades: UnidadeBase[] }>(
  blocos: B[],
  disp: Disponibilidade | null,
  temTabela: boolean,
): (Omit<B, 'unidades'> & { unidades: ComDisponibilidade<B['unidades'][number]>[] })[] {
  return blocos.map((b) => ({
    ...b,
    unidades: b.unidades.map((u) => aplicarNaUnidade(u as B['unidades'][number], disp, temTabela)),
  }));
}

/** Vendida e fora de venda não entram numa proposta nova. */
export function podeEscolher(situacao: SituacaoDaUnidade | null | undefined): boolean {
  return situacao !== 'vendida' && situacao !== 'indisponivel';
}

/** O texto da situação, que vai na célula e no leitor de tela (não depender só da cor). */
export function rotuloDaSituacao(situacao: SituacaoDaUnidade | null | undefined, descricao?: string | null): string | null {
  switch (situacao) {
    case 'disponivel':
      return 'disponível';
    case 'negociacao':
      return (descricao?.trim() || 'em negociação').toLowerCase();
    case 'vendida':
      return 'vendida';
    case 'indisponivel':
      return 'fora de venda';
    default:
      return null;
  }
}

/** "agora há pouco", "há 2 min", "há 1 h". */
export function haQuanto(iso: string | null, agora: number): string | null {
  if (!iso) return null;
  const ms = agora - Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  if (ms < 60_000) return 'agora há pouco';
  const min = Math.round(ms / 60_000);
  if (min < 60) return `há ${min} min`;
  return `há ${Math.round(min / 60)} h`;
}

export function estaDesatualizada(disp: Disponibilidade | null, agora: number): boolean {
  if (!disp?.temUau) return false;
  if (!disp.atualizadoEm) return true;
  return agora - Date.parse(disp.atualizadoEm) > PRAZO_FRESCOR_MS;
}
