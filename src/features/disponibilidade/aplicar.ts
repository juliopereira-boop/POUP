/**
 * A DISPONIBILIDADE DO CV SOBRE AS UNIDADES JÁ PRECIFICADAS — SEM TELA.
 *
 * Cada unidade ganha a SITUAÇÃO (verde/amarelo/vermelho/cinza), pela chave do
 * vínculo que o banco já resolveu. Unidade sem linha = sem cor, como era
 * antes. O preço não muda: é sempre o da tabela de preço enviada (o CV não
 * tem valor de venda por unidade).
 *
 * E uma regra de escolha: unidade VENDIDA ou FORA DE VENDA não pode ser
 * escolhida no simulador. Em negociação pode, com aviso (decisão do dono).
 */
import type { Disponibilidade, SituacaoDaUnidade } from '@/data/types';

/** Leitura mais velha que isto: a tela avisa que pode estar desatualizada. */
export const PRAZO_FRESCOR_MS = 3 * 60 * 1000;

export type ComDisponibilidade<U> = U & {
  /** `null` = sem informação do CV (grade sem cor nesta unidade). */
  situacao: Exclude<SituacaoDaUnidade, 'sem_vinculo'> | null;
  statusDescricao: string | null;
};

export function aplicarNaUnidade<U extends { id: string }>(u: U, disp: Disponibilidade | null): ComDisponibilidade<U> {
  const d = disp?.ativa ? disp.unidades.get(u.id) : undefined;
  const situacao = d && d.situacao !== 'sem_vinculo' ? d.situacao : null;
  return { ...u, situacao, statusDescricao: situacao ? (d?.statusDescricao ?? null) : null };
}

export function aplicarNosBlocos<B extends { unidades: { id: string }[] }>(
  blocos: B[],
  disp: Disponibilidade | null,
): (Omit<B, 'unidades'> & { unidades: ComDisponibilidade<B['unidades'][number]>[] })[] {
  return blocos.map((b) => ({
    ...b,
    unidades: b.unidades.map((u) => aplicarNaUnidade(u as B['unidades'][number], disp)),
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
  if (!disp?.ativa) return false;
  if (!disp.atualizadoEm) return true;
  return agora - Date.parse(disp.atualizadoEm) > PRAZO_FRESCOR_MS;
}
