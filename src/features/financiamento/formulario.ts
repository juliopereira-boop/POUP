/**
 * DO FORMULÁRIO PARA O MOTOR.
 *
 * ===========================================================================
 * POR QUE ISTO É UM ARQUIVO SEPARADO
 * ===========================================================================
 * O formulário guarda TEXTO — "R$ 210.000,00", "9,5", "80" — porque é isso que
 * um campo de entrada produz e é isso que o corretor lê enquanto digita. O
 * motor trabalha com centavos inteiros e frações. A tradução entre os dois
 * mundos é onde moram os erros clássicos (vírgula decimal, separador de
 * milhar, campo vazio virando zero), então ela fica **num lugar só**, pura e
 * testável, em vez de espalhada por cinco telas.
 *
 * A regra que vale em toda conversão daqui: **campo vazio não é zero.** Zero é
 * uma afirmação ("não tem entrada"); vazio é ausência. Onde a diferença
 * importa, a função devolve `null` e quem chama decide.
 */
import { currencyToNumber } from '@/lib/masks';
import type { SistemaAmortizacao } from './amortizacao';
import { reaisParaCentavos, ZERO, type Centavos } from './dinheiro';
import type { EntradaSimulacao } from './motor';
import type { TipoImovel, TipoOperacao } from './regras';

export interface FormFinanciamento {
  /* cliente */
  leadId: string | null;
  clientName: string;
  /** Anos. Texto porque vem de um campo; `''` = não informado. */
  idade: string;
  rendaFamiliar: string;
  proponentes: string;

  /* imóvel */
  companyId: string | null;
  developmentId: string | null;
  block: number;
  unit: string;
  operacao: TipoOperacao;
  tipoImovel: TipoImovel;
  uf: string | null;
  municipio: string;
  valorImovel: string;

  /* recursos */
  entradaPropria: string;
  fgts: string;
  subsidio: string;

  /* condição */
  produtoId: string;
  sistema: SistemaAmortizacao;
  prazoMeses: string;
  /** Só usados quando o produto é de parâmetros manuais. */
  taxaAnual: string;
  quotaMax: string;
  comprometimento: string;
}

export const FORM_INICIAL: FormFinanciamento = {
  leadId: null,
  clientName: '',
  idade: '',
  rendaFamiliar: '',
  proponentes: '1',

  companyId: null,
  developmentId: null,
  block: 0,
  unit: '',
  operacao: 'aquisicao_novo',
  tipoImovel: 'residencial',
  uf: null,
  municipio: '',
  valorImovel: '',

  entradaPropria: '',
  fgts: '',
  subsidio: '',

  produtoId: 'informado',
  sistema: 'SAC',
  prazoMeses: '360',
  taxaAnual: '',
  quotaMax: '80',
  comprometimento: '30',
};

/** Dinheiro mascarado → centavos. Campo vazio vira zero, que aqui é correto. */
export function dinheiro(texto: string): Centavos {
  const t = texto.trim();
  if (!t) return ZERO;
  return reaisParaCentavos(currencyToNumber(t));
}

/**
 * Número decimal digitado em pt-BR → `number`.
 *
 * "9,5" e "9.5" viram 9.5. Vazio vira `null` — e a distinção importa: taxa
 * vazia faz o motor recusar a simulação com uma mensagem, enquanto taxa zero é
 * uma condição legítima (existe linha subsidiada a juro zero).
 */
export function decimal(texto: string): number | null {
  const t = texto.trim().replace('%', '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function inteiro(texto: string): number | null {
  const n = decimal(texto);
  return n === null ? null : Math.round(n);
}

export function paraEntrada(form: FormFinanciamento): EntradaSimulacao {
  return {
    operacao: form.operacao,
    tipoImovel: form.tipoImovel,
    uf: form.uf,
    municipio: form.municipio.trim() || null,
    valorImovel: dinheiro(form.valorImovel),

    entradaPropria: dinheiro(form.entradaPropria),
    fgts: dinheiro(form.fgts),
    subsidio: dinheiro(form.subsidio),

    rendaFamiliarMensal: dinheiro(form.rendaFamiliar),
    quantidadeProponentes: inteiro(form.proponentes) ?? 1,
    idadeAnos: inteiro(form.idade),

    produtoId: form.produtoId,
    sistema: form.sistema,
    prazoMeses: inteiro(form.prazoMeses) ?? 0,

    taxaAnualPctInformada: decimal(form.taxaAnual),
    quotaMaxPctInformada: decimal(form.quotaMax),
    comprometimentoMaxPctInformado: decimal(form.comprometimento),
  };
}

/**
 * O formulário tem o mínimo para simular?
 *
 * Devolve a lista do que falta, em português, na ORDEM DA TELA — para o aviso
 * apontar para o primeiro campo vazio de cima para baixo, e não para um
 * qualquer.
 */
export function faltando(form: FormFinanciamento, exigeTaxa: boolean): string[] {
  const faltas: string[] = [];
  if (dinheiro(form.valorImovel) <= 0) faltas.push('o valor do imóvel');
  if (dinheiro(form.rendaFamiliar) <= 0) faltas.push('a renda familiar');
  if ((inteiro(form.prazoMeses) ?? 0) <= 0) faltas.push('o prazo em meses');
  if (exigeTaxa && decimal(form.taxaAnual) === null) faltas.push('a taxa de juros ao ano');
  return faltas;
}

/**
 * Data de nascimento (AAAA-MM-DD) → idade em anos completos.
 *
 * Feito com aritmética de string, **sem passar por `Date`**. `new
 * Date('1990-05-10')` é lido como meia-noite UTC e, no fuso do Brasil, volta um
 * dia — o que muda a idade de quem faz aniversário hoje. Numa simulação em que
 * idade + prazo é critério de recusa, um ano a mais reprova sem motivo.
 */
export function idadeEmAnos(nascimento: string | null, hojeISO: string): number | null {
  if (!nascimento) return null;
  const n = /^(\d{4})-(\d{2})-(\d{2})$/.exec(nascimento.trim());
  const h = /^(\d{4})-(\d{2})-(\d{2})$/.exec(hojeISO.trim());
  if (!n || !h) return null;
  let anos = Number(h[1]) - Number(n[1]);
  const passouAniversario =
    Number(h[2]) > Number(n[2]) || (Number(h[2]) === Number(n[2]) && Number(h[3]) >= Number(n[3]));
  if (!passouAniversario) anos -= 1;
  return anos >= 0 && anos < 130 ? anos : null;
}

/** "Hoje" no fuso DO APARELHO, nunca em UTC. */
export function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const PRAZOS_COMUNS = [
  { value: '120', label: '10 anos (120 meses)' },
  { value: '180', label: '15 anos (180 meses)' },
  { value: '240', label: '20 anos (240 meses)' },
  { value: '300', label: '25 anos (300 meses)' },
  { value: '360', label: '30 anos (360 meses)' },
  { value: '420', label: '35 anos (420 meses)' },
];
