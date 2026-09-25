/**
 * O RANKING, DO LADO DO APLICATIVO — só textos, contas e formatos.
 *
 * As REGRAS de quem pontua moram no banco (migration
 * `20260925150000_ranking.sql`), e é de propósito: calculadas no aparelho,
 * seriam só sugestão. Aqui fica o que a tela precisa para explicar o
 * resultado ao corretor — o nome de cada situação, o que fazer para uma venda
 * passar a contar, quanto falta para a temporada acabar.
 *
 * Puro (sem React, sem banco): roda nos testes em Node.
 */

export type Escopo = 'cidade' | 'estado' | 'brasil';
export type Periodo = 'mes' | 'ano';

export type SituacaoDaVenda =
  | 'conta'
  | 'distratada'
  | 'futura'
  | 'dados_incompletos'
  | 'sem_comprovante'
  | 'duplicada'
  | 'em_disputa'
  | 'acima_do_teto'
  | 'invalidada';

export interface LinhaDoRanking {
  posicao: number;
  participante: string;
  nome: string;
  fotoUrl: string | null;
  imobiliaria: string | null;
  cidade: string | null;
  uf: string | null;
  vendas: number;
  vgv: number;
  eu: boolean;
}

export const TETO_MENSAL = 20;

interface TextoDaSituacao {
  rotulo: string;
  /** Para contagens: "2 sem comprovante", "1 em disputa". */
  curto: string;
  /** O que o corretor faz para a venda passar a contar. `null` = nada a fazer. */
  acao: string | null;
  tom: 'ok' | 'pendente' | 'fora';
}

export const SITUACOES: Record<SituacaoDaVenda, TextoDaSituacao> = {
  conta: { rotulo: 'Pontuando no ranking', curto: 'pontuando', acao: null, tom: 'ok' },
  sem_comprovante: {
    rotulo: 'Falta o comprovante',
    curto: 'sem comprovante',
    acao: 'Anexe o contrato assinado ou o comprovante da comissão.',
    tom: 'pendente',
  },
  dados_incompletos: {
    rotulo: 'Dados incompletos',
    curto: 'com dados incompletos',
    acao: 'Confira o CPF do comprador, o empreendimento, a unidade e o valor.',
    tom: 'pendente',
  },
  em_disputa: {
    rotulo: 'Em disputa',
    curto: 'em disputa',
    acao: 'Outra conta registrou a mesma unidade ou o mesmo comprador. A auditoria do POUP vai conferir os comprovantes.',
    tom: 'pendente',
  },
  acima_do_teto: {
    rotulo: 'Aguardando auditoria',
    curto: 'aguardando auditoria',
    acao: `Mais de ${TETO_MENSAL} vendas no mês: as excedentes contam depois que a auditoria confere.`,
    tom: 'pendente',
  },
  duplicada: { rotulo: 'Venda repetida', curto: 'repetidas', acao: 'Esta unidade já está em outra venda sua.', tom: 'fora' },
  futura: { rotulo: 'Data no futuro', curto: 'com data no futuro', acao: 'A venda conta a partir da data do fechamento.', tom: 'fora' },
  distratada: { rotulo: 'Distratada', curto: 'distratadas', acao: null, tom: 'fora' },
  invalidada: { rotulo: 'Invalidada pela auditoria', curto: 'invalidadas', acao: null, tom: 'fora' },
};

export function textoDaSituacao(s: string): TextoDaSituacao {
  return (SITUACOES as Record<string, TextoDaSituacao>)[s] ?? { rotulo: s, curto: s, acao: null, tom: 'fora' };
}

/** Quantas vendas em cada situação — é o resumo "3 faltam comprovante". */
export function resumoDasSituacoes(situacoes: string[]): Partial<Record<SituacaoDaVenda, number>> {
  const r: Partial<Record<SituacaoDaVenda, number>> = {};
  for (const s of situacoes) r[s as SituacaoDaVenda] = (r[s as SituacaoDaVenda] ?? 0) + 1;
  return r;
}

// ---------------------------------------------------------------- participar

interface PerfilParaRanking {
  fullName: string | null;
  cpf: string | null;
  creci: string | null;
  cidade: string | null;
  uf: string | null;
}

/** O que falta no perfil para entrar no ranking (a mesma regra do banco). */
export function faltaParaParticipar(p: PerfilParaRanking | null, cpfValido: (cpf: string) => boolean): string[] {
  if (!p) return ['Perfil'];
  const falta: string[] = [];
  if (!p.fullName?.trim()) falta.push('Nome completo');
  if (!p.cpf || !cpfValido(p.cpf)) falta.push('CPF');
  if (!p.creci?.trim()) falta.push('CRECI');
  if (!p.uf) falta.push('Estado');
  if (!p.cidade?.trim()) falta.push('Cidade');
  return falta;
}

// ---------------------------------------------------------------- a temporada

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/** "Temporada de Setembro" / "Temporada 2026". */
export function nomeDaTemporada(periodo: Periodo, hoje: Date): string {
  return periodo === 'ano' ? `Temporada ${hoje.getFullYear()}` : `Temporada de ${MESES[hoje.getMonth()]}`;
}

/** Dias até a temporada virar (contando hoje). 1 = último dia. */
export function diasAteOFim(periodo: Periodo, hoje: Date): number {
  const fim =
    periodo === 'ano' ? new Date(hoje.getFullYear(), 11, 31) : new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
  const inicioDoDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((fim.getTime() - inicioDoDia.getTime()) / 86_400_000) + 1;
}

export function textoDoPrazo(periodo: Periodo, hoje: Date): string {
  const d = diasAteOFim(periodo, hoje);
  if (d <= 1) return 'Último dia da temporada';
  return `Faltam ${d} dias`;
}

// ---------------------------------------------------------------- formatos

/** "R$ 1,2 mi", "R$ 750 mil", "R$ 900". */
export function vgvCurto(v: number): string {
  if (v >= 1_000_000) {
    return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  }
  if (v >= 1000) return `R$ ${Math.round(v / 1000).toLocaleString('pt-BR')} mil`;
  return `R$ ${Math.round(v).toLocaleString('pt-BR')}`;
}

/** "Ana Souza" → "AS"; "Bruno" → "B". */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  const primeira = partes[0][0] ?? '';
  const ultima = partes.length > 1 ? (partes[partes.length - 1][0] ?? '') : '';
  return (primeira + ultima).toUpperCase();
}

/** Uma cor estável por pessoa, para o círculo das iniciais. */
export function corDoParticipante(id: string, paleta: string[]): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return paleta[h % paleta.length];
}

export function rotuloDoEscopo(escopo: Escopo, cidade: string | null, uf: string | null): string {
  if (escopo === 'cidade') return cidade ? `${cidade}${uf ? `/${uf}` : ''}` : 'Sua cidade';
  if (escopo === 'estado') return uf ?? 'Seu estado';
  return 'Brasil';
}

/** "1º", "2º"… */
export function ordinal(n: number): string {
  return `${n}º`;
}
