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

  /**
   * O banco escolhido na porta do simulador.
   *
   * É ele que decide, sozinho, qual linha de financiamento vale — e por isso o
   * corretor não precisa mais escolher produto. `null` só acontece em rascunho
   * antigo, salvo antes de a lista de bancos existir.
   */
  bancoId: string | null;

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
  bancoId: null,
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
  // Defesa contra rascunho antigo: ver `sanearForm`. Aqui é a última linha —
  // este módulo é chamado pelo motor e por testes, sem passar pelo provider.
  if (!Array.isArray(lista)) return [];
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

  /*
   * ENTRADA EM BRANCO SIGNIFICA "CALCULE PARA MIM".
   *
   * É o estado normal do simulador: o corretor quer saber quanto o banco
   * empresta, e a entrada é o que sobra — não é uma pergunta, é a resposta.
   * Ele só digita quando o cliente QUER dar mais que o mínimo, e aí o
   * financiamento encolhe na mesma medida.
   *
   * Zero digitado ("R$ 0,00") não é o mesmo que branco: é o corretor afirmando
   * que não há entrada nenhuma, e o motor obedece.
   */
  const entradaAutomatica = form.entradaPropria.trim() === '';

  return {
    operacao: form.operacao,
    tipoImovel: form.tipoImovel,
    uf: form.uf,
    municipio: form.municipio.trim() || null,
    valorImovel: dinheiro(form.valorImovel),
    valorAvaliacao: dinheiro(form.valorAvaliacao),

    entradaPropria: dinheiro(form.entradaPropria),
    entradaAutomatica,
    fgtsDisponivel: disponivel,
    fgtsUsado,
    subsidio: dinheiro(form.subsidio),

    proponentes: paraProponentes(form.proponentes),

    bancoId: form.bancoId,
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

/**
 * SANEAMENTO DO RASCUNHO — o conserto da tela branca no celular.
 *
 * ===========================================================================
 * O QUE ACONTECEU
 * ===========================================================================
 * O rascunho do simulador é gravado no aparelho como JSON e relido na abertura
 * seguinte. Só que o formato do formulário MUDOU entre duas versões do POUP:
 * na primeira, `proponentes` era o texto `'1'` (quantas pessoas compõem
 * renda); na atual, é a LISTA das pessoas.
 *
 * Um `{ ...FORM_INICIAL, ...rascunho }` não percebe isso — ele obedece o
 * rascunho e põe a string `'1'` onde o código espera um array. Na primeira
 * linha que chama `.map`, o app quebra inteiro.
 *
 * E quebra **só em quem já tinha usado o simulador antes**: no computador em
 * que o rascunho era novo, tudo funcionava; no celular que tinha o rascunho
 * velho, tela branca. Foi exatamente esse o relato.
 *
 * ===========================================================================
 * A REGRA QUE ISSO DEIXA
 * ===========================================================================
 * **Dado que veio do armazenamento local é entrada não confiável.** Ele foi
 * escrito por uma versão do aplicativo que não existe mais e nunca vai ser
 * migrado por ninguém. Então nada dele entra no estado sem passar por aqui:
 * cada campo é conferido contra o tipo que o formulário espera e, no que não
 * bater, vale o valor inicial.
 *
 * O efeito para o corretor é o melhor possível: em vez de perder a tela, ele
 * perde no máximo um campo que aquela versão nem sabia preencher.
 */
export function sanearForm(bruto: unknown): FormFinanciamento {
  const base: FormFinanciamento = { ...FORM_INICIAL, proponentes: [proponenteVazio('p1')] };
  if (!bruto || typeof bruto !== 'object') return base;
  const d = bruto as Record<string, unknown>;

  const texto = (chave: keyof FormFinanciamento): string => {
    const v = d[chave];
    return typeof v === 'string' ? v : (base[chave] as string);
  };
  const opcional = (chave: keyof FormFinanciamento): string | null => {
    const v = d[chave];
    if (v === null) return null;
    return typeof v === 'string' ? v : (base[chave] as string | null);
  };
  const umDe = <T extends string>(chave: keyof FormFinanciamento, valores: readonly T[]): T => {
    const v = d[chave];
    return valores.includes(v as T) ? (v as T) : (base[chave] as T);
  };

  /*
   * A lista de proponentes é o campo que causou a queda, e é o único que pode
   * chegar como string. Ela é reconstruída pessoa a pessoa; se sobrar zero
   * pessoa válida, entra uma vazia — formulário sem proponente não tem renda,
   * e sem renda não há simulação.
   */
  const crus = Array.isArray(d.proponentes) ? d.proponentes : [];
  const proponentes: FormProponente[] = crus
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .slice(0, 4)
    .map((p, i) => ({
      id: typeof p.id === 'string' && p.id ? p.id : `p${i + 1}`,
      nome: typeof p.nome === 'string' ? p.nome : '',
      idade: typeof p.idade === 'string' ? p.idade : '',
      rendaBruta: typeof p.rendaBruta === 'string' ? p.rendaBruta : '',
      participacao: typeof p.participacao === 'string' ? p.participacao : '',
    }));

  return {
    leadId: opcional('leadId'),
    bancoId: opcional('bancoId'),
    proponentes: proponentes.length > 0 ? proponentes : [proponenteVazio('p1')],

    companyId: opcional('companyId'),
    developmentId: opcional('developmentId'),
    block: typeof d.block === 'number' && Number.isFinite(d.block) ? d.block : base.block,
    unit: texto('unit'),
    operacao: umDe('operacao', [
      'aquisicao_novo',
      'aquisicao_usado',
      'construcao',
      'terreno_e_construcao',
    ] as const),
    tipoImovel: umDe('tipoImovel', ['residencial', 'comercial'] as const),
    uf: opcional('uf'),
    municipio: texto('municipio'),
    valorImovel: texto('valorImovel'),
    valorAvaliacao: texto('valorAvaliacao'),

    entradaPropria: texto('entradaPropria'),
    fgtsDisponivel: texto('fgtsDisponivel'),
    fgtsUsado: texto('fgtsUsado'),
    subsidio: texto('subsidio'),

    produtoId: texto('produtoId'),
    sistema: umDe('sistema', ['SAC', 'PRICE'] as const),
    prazoMeses: texto('prazoMeses'),
    carenciaMeses: texto('carenciaMeses'),
    cenarioIndexador: texto('cenarioIndexador'),

    taxaAnual: texto('taxaAnual'),
    regimeTaxa: umDe('regimeTaxa', ['nominal', 'efetiva'] as const),
    quotaMax: texto('quotaMax'),
    comprometimento: texto('comprometimento'),
  };
}

/** A renda familiar somada, para a tela mostrar sem chamar o motor. */
export function rendaFamiliar(form: FormFinanciamento): Centavos {
  if (!Array.isArray(form.proponentes)) return ZERO as Centavos;
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
