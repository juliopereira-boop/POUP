/**
 * O ESTADO DO SIMULADOR DE POUPANÇA — só dados, sem React.
 *
 * Mora fora do `SimuladorProvider` para poder ser importado por código puro —
 * as regras de validação (`pendencias.ts`) e os testes, que rodam em Node sem
 * montar tela nenhuma. O provider reexporta tudo, então quem importava de lá
 * continua importando de lá.
 */
import type { Company } from '@/data/types';
import { formatCurrencyBRL } from '@/lib/masks';

export interface Proponent {
  name: string;
  cpf: string;
  email: string;
  contact: string;
  rendaBruta: string;
}

export type AssociationType = 'conjuge' | 'parente' | 'fiador' | 'socio';

export const ASSOCIATION_OPTIONS: { value: AssociationType; label: string }[] = [
  { value: 'conjuge', label: 'Cônjuge' },
  { value: 'parente', label: 'Parente' },
  { value: 'fiador', label: 'Fiador' },
  { value: 'socio', label: 'Sócio' },
];

export function emptyProponent(): Proponent {
  return { name: '', cpf: '', email: '', contact: '', rendaBruta: '' };
}

/**
 * O que a tabela de preço diz da unidade escolhida.
 *
 * Guardado junto da simulação para os dois blocos mostrarem a mesma coisa
 * ("3º andar · mais ventilado · vaga de moto · 40,94 m²") sem reler a tabela,
 * e para a proposta de amanhã lembrar de qual tabela o preço saiu.
 */
export interface DetalheDaUnidade {
  empreendimento: string;
  /** "Setembro". Vazio quando a tabela não tem referência. */
  referencia: string;
  pavimento: number;
  vendaTabela: number;
  avaliacao: number | null;
  areaM2: number | null;
  vaga: 'carro' | 'moto' | null;
  ventilacao: 'mais' | 'menos' | null;
}

export interface SimuladorState {
  companyId: string | null;
  developmentId: string | null;
  /**
   * Número do bloco. Continua existindo porque vendas e relatórios antigos o
   * leem como número; quando o bloco vem do cadastro, é a posição dele (1, 2...).
   */
  block: number;
  /**
   * Bloco escolhido no cadastro de blocos. `null` = empreendimento sem blocos
   * cadastrados, e aí vale o número digitado em `block`.
   */
  blockId: string | null;
  /** Como o bloco sai na proposta: "Torre A", "Quadra 3". Vazio = usar `block`. */
  blockName: string;
  unit: string;
  /** Unidade escolhida no cadastro. `null` = digitada à mão. */
  unitId: string | null;
  /** O VALOR DE VENDA da unidade. O nome do campo é histórico. */
  unitValue: string;
  /** A unidade veio da tabela de preço: o que a tabela diz dela. `null` = não veio. */
  unitDetails: DetalheDaUnidade | null;
  companyRisk: number | null;
  companyMaxInstallments: number | null;
  companyMaxSemiannual: number | null;
  companyMaxAnnual: number | null;
  companyCoincide: boolean;
  correspondentId: string | null;
  correspondentName: string | null;
  proponent1: Proponent;
  hasSecondProponent: boolean;
  association: AssociationType | null;
  proponent2: Proponent;

  financingApproved: string;
  subsidy: string;
  fgts: string;
  couponType: 'R$' | '%' | null;
  couponValue: string;
  couponWarningSeen: boolean;

  cefClientPays: boolean;
  cefInstallment: boolean;
  cefInstallmentsCount: string;
  cefParcela: string;

  ato: string;
  atoDueDate: string | null;
  mensaisCount: string;
  mensalDueDay: string;
  semestralEnabled: boolean;
  semestralCount: string;
  semestralValue: string;
  anualEnabled: boolean;
  anualCount: string;
  anualValue: string;
}

export const INITIAL_SIMULADOR_STATE: SimuladorState = {
  companyId: null,
  developmentId: null,
  block: 0,
  blockId: null,
  blockName: '',
  unit: '',
  unitId: null,
  unitValue: '',
  unitDetails: null,
  companyRisk: null,
  companyMaxInstallments: null,
  companyMaxSemiannual: null,
  companyMaxAnnual: null,
  companyCoincide: true,
  correspondentId: null,
  correspondentName: null,
  proponent1: emptyProponent(),
  hasSecondProponent: false,
  association: null,
  proponent2: emptyProponent(),
  financingApproved: '',
  subsidy: '',
  fgts: '',
  couponType: null,
  couponValue: '',
  couponWarningSeen: false,
  cefClientPays: true,
  cefInstallment: false,
  cefInstallmentsCount: '',
  cefParcela: '',
  ato: '',
  atoDueDate: null,
  mensaisCount: '',
  mensalDueDay: '',
  semestralEnabled: false,
  semestralCount: '',
  semestralValue: '',
  anualEnabled: false,
  anualCount: '',
  anualValue: '',
};

/**
 * Como o bloco aparece para gente: o nome do cadastro, ou o número digitado.
 *
 * Aceita os campos ausentes de propósito: as simulações salvas em Relatórios
 * antes do cadastro de blocos não têm `blockName`, e abrir uma delas não pode
 * quebrar a tela.
 */
export function nomeDoBloco(sim: { block?: number | null; blockName?: string | null }): string {
  const nome = (sim.blockName ?? '').trim();
  if (nome) return nome;
  return sim.block != null && sim.block > 0 ? String(sim.block) : '';
}

// ---------------------------------------------------------------- tabela de preço

/** As regras da construtora que o simulador aplica: risco e máximos de parcelas. */
export function regrasDaConstrutora(c: Company | undefined): Partial<SimuladorState> {
  return {
    companyRisk: c?.risk ?? null,
    companyMaxInstallments: c?.maxInstallments ?? null,
    companyMaxSemiannual: c?.maxSemiannual ?? null,
    companyMaxAnnual: c?.maxAnnual ?? null,
    companyCoincide: c?.coincideInstallments ?? true,
  };
}

export interface EscolhaDaTabela {
  companyId: string | null;
  developmentId: string;
  blockId: string;
  blockName: string;
  /** Posição do bloco no cadastro (0, 1...). Vira o número do bloco. */
  blockOrdem: number;
  unitId: string;
  codigo: string;
  detalhe: DetalheDaUnidade;
}

/**
 * Tudo o que muda na simulação quando o corretor escolhe a unidade pela
 * tabela: o imóvel inteiro (construtora, empreendimento, bloco, unidade) e o
 * valor de venda. É o que faz o bloco 2 já abrir preenchido.
 *
 * Trocar de construtora limpa o correspondente — ele é da construtora antiga —
 * e troca as regras dela (risco, máximos de parcelas).
 */
export function estadoDaEscolha(
  e: EscolhaDaTabela,
  anterior: Pick<SimuladorState, 'companyId'>,
  construtora?: Company,
): Partial<SimuladorState> {
  const trocou = e.companyId !== anterior.companyId;
  return {
    companyId: e.companyId,
    developmentId: e.developmentId,
    blockId: e.blockId,
    blockName: e.blockName,
    block: e.blockOrdem + 1,
    unit: e.codigo,
    unitId: e.unitId,
    unitValue: formatCurrencyBRL(String(Math.round(e.detalhe.vendaTabela * 100))),
    unitDetails: e.detalhe,
    ...(trocou ? { correspondentId: null, correspondentName: null, ...regrasDaConstrutora(construtora) } : {}),
  };
}

/** A unidade deixou de vir da tabela: o valor de venda fica, o resto sai. */
export const SEM_UNIDADE: Partial<SimuladorState> = {
  blockId: null,
  blockName: '',
  block: 0,
  unit: '',
  unitId: null,
  unitDetails: null,
};
