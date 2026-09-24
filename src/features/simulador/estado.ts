/**
 * O ESTADO DO SIMULADOR DE POUPANÇA — só dados, sem React.
 *
 * Mora fora do `SimuladorProvider` para poder ser importado por código puro —
 * as regras de validação (`pendencias.ts`) e os testes, que rodam em Node sem
 * montar tela nenhuma. O provider reexporta tudo, então quem importava de lá
 * continua importando de lá.
 */

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
