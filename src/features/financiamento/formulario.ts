/**
 * DO FORMULÁRIO PARA O MOTOR.
 *
 * ===========================================================================
 * POR QUE ISTO É UM ARQUIVO SEPARADO
 * ===========================================================================
 * O formulário guarda TEXTO — "R$ 210.000,00", "9,5", "80" — porque é isso que
 * um campo de entrada produz e é isso que o corretor lê enquanto digita. O
 * motor trabalha com centavos inteiros e frações. A tradução entre os dois
 * mundos é onde moram os erros clássicos (vírgula decimal, separador de milhar,
 * campo vazio virando zero), então ela fica **num lugar só**, pura e testável.
 *
 * A regra que vale em toda conversão daqui: **campo vazio não é zero.** Zero é
 * uma afirmação ("não tem entrada"); vazio é ausência. Onde a diferença
 * importa, a função devolve `null` e quem chama decide.
 */
import { currencyToNumber } from '@/lib/masks';
import type { SistemaAmortizacao } from './amortizacao';
import { reaisParaCentavos, ZERO, type Centavos, type RegimeTaxa } from './dinheiro';
import type { EntradaSimulacao } from './motor';
import type { Proponente } from './proponentes';
import type { TipoImovel, TipoOperacao } from './regras';

/** Um proponente, do jeito que a tela guarda. */
export interface FormProponente {
  id: string;
  nome: string;
  /** Anos. `''` = não informado, e aí o limite de idade não é verificado. */
  idade: string;
  rendaBruta: string;
  /** % de pactuação. `''` = derivar da proporção das rendas. */
  participacao: string;
}

export interface FormFinanciamento {
  leadId: string | null;

  /* proponentes */
  proponentes: FormProponente[];

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
  /** Valor de avaliação. Vazio = usar o preço de venda, com aviso. */
  valorAvaliacao: string;

  /* recursos */
  entradaPropria: string;
  fgtsDisponivel: string;
  fgtsUsado: string;
  subsidio: string;

  /* condição */
  produtoId: string;
  sistema: SistemaAmortizacao;
  prazoMeses: string;
  carenciaMeses: string;
  /** Cenário do indexador em % a.m. `''` = usar o índice cadastrado. */
  cenarioIndexador: string;

  /* só para produto de parâmetros manuais */
  taxaAnual: string;
  regimeTaxa: RegimeTaxa;
  quotaMax: string;
  comprometimento: string;
}

export function proponenteVazio(id: string): FormProponente {
  return { id, nome: '', idade: '', rendaBruta: '', participacao: '' };
}

export const FORM_INICIAL: FormFinanciamento = {
  leadId: null,
  proponentes: [proponenteVazio('p1')],

  companyId: null,
  developmentId: null,
  block: 0,
  unit: '',
  operacao: 'aquisicao_novo',
  tipoImovel: 'residencial',
  uf: null,
  municipio: '',
  valorImovel: '',
  valorAvaliacao: '',

  entradaPropria: '',
  fgtsDisponivel: '',
  fgtsUsado: '',
  subsidio: '',

  produtoId: 'informado',
  sistema: 'SAC',
  prazoMeses: '360',
  carenciaMeses: '',
  cenarioIndexador: '',

  taxaAnual: '',
  regimeTaxa: 'nominal',
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

export function paraProponentes(lista: FormProponente[]): Proponente[] {
  return lista.map((p) => ({
    id: p.id,
    nome: p.nome.trim(),
    idadeAnos: inteiro(p.idade),
    rendaBruta: dinheiro(p.rendaBruta),
    participacaoPct: decimal(p.participacao),
  }));
}

export function paraEntrada(form: FormFinanciamento): EntradaSimulacao {
  /*
   * O FGTS USADO CAI PARA O DISPONÍVEL quando só o saldo é informado.
   *
   * Na prática o corretor digita o saldo do extrato e quer usar tudo. Exigir
   * que ele digite o mesmo número duas vezes seria atrito puro — e deixar o
   * "usado" em zero faria a simulação ignorar o FGTS em silêncio, que é pior.
   */
  const disponivel = dinheiro(form.fgtsDisponivel);
  const usadoDigitado = form.fgtsUsado.trim() ? dinheiro(form.fgtsUsado) : null;
  const fgtsUsado = usadoDigitado ?? disponivel;

  return {
    operacao: form.operacao,
    tipoImovel: form.tipoImovel,
    uf: form.uf,
    municipio: form.municipio.trim() || null,
    valorImovel: dinheiro(form.valorImovel),
    valorAvaliacao: dinheiro(form.valorAvaliacao),

    entradaPropria: dinheiro(form.entradaPropria),
    fgtsDisponivel: disponivel,
    fgtsUsado,
    subsidio: dinheiro(form.subsidio),

    proponentes: paraProponentes(form.proponentes),

    produtoId: form.produtoId,
    sistema: form.sistema,
    prazoMeses: inteiro(form.prazoMeses) ?? 0,
    carenciaMeses: inteiro(form.carenciaMeses) ?? 0,
    cenarioIndexadorPct: decimal(form.cenarioIndexador),

    taxaAnualPctInformada: decimal(form.taxaAnual),
    regimeTaxaInformado: form.regimeTaxa,
    quotaMaxPctInformada: decimal(form.quotaMax),
    comprometimentoMaxPctInformado: decimal(form.comprometimento),
  };
}

/** A renda familiar somada, para a tela mostrar sem chamar o motor. */
export function rendaFamiliar(form: FormFinanciamento): Centavos {
  return form.proponentes.reduce(
    (soma, p) => (soma + dinheiro(p.rendaBruta)) as Centavos,
    ZERO as Centavos,
  );
}

/**
 * O formulário tem o mínimo para simular?
 *
 * Devolve o que falta, em português, na ORDEM DA TELA — para o aviso apontar
 * para o primeiro campo vazio de cima para baixo, e não para um qualquer.
 */
export function faltando(form: FormFinanciamento, exigeTaxa: boolean): string[] {
  const faltas: string[] = [];
  if (dinheiro(form.valorImovel) <= 0) faltas.push('o valor do imóvel');
  if (rendaFamiliar(form) <= 0) faltas.push('a renda dos proponentes');
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

export const REGIMES_TAXA: { value: RegimeTaxa; label: string }[] = [
  { value: 'nominal', label: 'Nominal ao ano (÷ 12)' },
  { value: 'efetiva', label: 'Efetiva ao ano (composta)' },
];
