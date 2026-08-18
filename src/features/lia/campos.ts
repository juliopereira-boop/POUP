/**
 * O QUE A LIA PRECISA OUVIR.
 *
 * ===========================================================================
 * ESTE ARQUIVO É A FONTE ÚNICA DA VERDADE
 * ===========================================================================
 * A lista abaixo é lida por três lugares que, em quase todo projeto, acabam
 * divergindo com o tempo:
 *
 *   1. o **prompt** mandado ao modelo (a Edge Function recebe esta lista pronta
 *      e monta o prompt a partir dela — a função não tem lista própria);
 *   2. a **tela**, que mostra o que já foi capturado e o que ainda falta;
 *   3. o **preenchimento** do simulador no fim.
 *
 * Isso é deliberado e é o que faz a LIA crescer barato: para ela passar a ouvir
 * um campo novo, acrescente uma linha aqui. Não se mexe no prompt, não se
 * republica Edge Function nenhuma, não se toca na tela.
 *
 * ===========================================================================
 * O QUE NÃO ESTÁ AQUI, E POR QUÊ
 * ===========================================================================
 * - **Dados do corretor** (nome, imobiliária, CNPJ, CRECI, gerente imob): já
 *   estão no perfil. Pedir que a LIA os ouça seria dar chance de errar o que já
 *   está certo.
 * - **Gerente do empreendimento**: sai do cadastro do empreendimento
 *   (`Development.managerName`), automaticamente, assim que o empreendimento é
 *   identificado.
 * - **Empresa/construtora**: não se pergunta. Ela é *deduzida* do
 *   empreendimento — é isso que faz a LIA parecer que "já sabe".
 * - **Risco, prazos máximos e regra de comissão**: vêm da empresa do catálogo.
 */
import { cpfDigits, formatCurrencyBRL } from '@/lib/masks';
import type { Proponent, SimuladorState } from '@/features/simulador/SimuladorProvider';

/** Como o valor deve ser interpretado e normalizado. */
export type TipoCampo =
  | 'texto'
  | 'dinheiro'
  | 'inteiro'
  | 'cpf'
  | 'telefone'
  | 'email'
  | 'dia_do_mes'
  | 'sim_nao'
  | 'opcao'
  | 'empreendimento'
  | 'correspondente';

export type GrupoCampo = 'imovel' | 'cliente' | 'segundo' | 'financiamento' | 'pagamento';

export const GRUPO_ROTULO: Record<GrupoCampo, string> = {
  imovel: 'Imóvel',
  cliente: 'Cliente',
  segundo: 'Segundo proponente',
  financiamento: 'Financiamento',
  pagamento: 'Forma de pagamento',
};

export interface CampoLia {
  chave: string;
  rotulo: string;
  tipo: TipoCampo;
  grupo: GrupoCampo;
  /**
   * Instrução para o modelo: **como isso aparece numa conversa de verdade**.
   *
   * Não é a definição do campo — é o jeito como um corretor e um cliente falam
   * dele. É o que separa "extrair renda" de entender que "ela ganha três e
   * meio" são R$ 3.500,00.
   */
  comoAparece: string;
  /** Sem isto, a simulação não fecha. É o que a tela cobra no silêncio. */
  essencial: boolean;
  /** Valores fechados, quando `tipo === 'opcao'`. */
  opcoes?: string[];
}

export const CAMPOS: CampoLia[] = [
  // ----------------------------------------------------------------- imóvel
  {
    chave: 'empreendimento',
    rotulo: 'Empreendimento',
    tipo: 'empreendimento',
    grupo: 'imovel',
    essencial: true,
    comoAparece:
      'O nome do residencial/condomínio/loteamento. Quase nunca vem completo: "o Vila Nova", "aquele lá do Parque das Águas", "no Reserva". Case com a lista de empreendimentos fornecida, mesmo com nome parcial, ordem trocada ou erro de transcrição. Devolva o ID exato da lista.',
  },
  {
    chave: 'bloco',
    rotulo: 'Bloco / Quadra',
    tipo: 'inteiro',
    grupo: 'imovel',
    essencial: true,
    comoAparece:
      'Bloco, quadra ou torre. Pode vir como letra ("bloco B") — nesse caso converta pela posição no alfabeto (A=1, B=2...). "Sem bloco", "não tem bloco" ou loteamento avulso é 0.',
  },
  {
    chave: 'unidade',
    rotulo: 'Unidade',
    tipo: 'texto',
    grupo: 'imovel',
    essencial: true,
    comoAparece:
      'Número do apartamento, casa ou lote: "apartamento 302", "a 14", "lote 7". Só o identificador, sem a palavra.',
  },
  {
    chave: 'valorUnidade',
    rotulo: 'Valor da unidade',
    tipo: 'dinheiro',
    grupo: 'imovel',
    essencial: true,
    comoAparece:
      'Preço de tabela do imóvel. "Duzentos e dez mil", "210", "210 mil" no contexto de preço de imóvel = 210000. Não confunda com renda, entrada, subsídio nem parcela.',
  },
  {
    chave: 'correspondente',
    rotulo: 'Correspondente bancário',
    tipo: 'correspondente',
    grupo: 'imovel',
    essencial: true,
    comoAparece:
      'A pessoa ou empresa que faz o financiamento na Caixa. Case com a lista de correspondentes fornecida e devolva o ID. Se citarem um nome que não está na lista, devolva o nome falado mesmo assim.',
  },

  // ---------------------------------------------------------------- cliente
  {
    chave: 'clienteNome',
    rotulo: 'Nome do cliente',
    tipo: 'texto',
    grupo: 'cliente',
    essencial: true,
    comoAparece:
      'Nome completo do proponente principal. Pode aparecer na apresentação ("meu nome é...", "é a Maria"), ou o corretor repetindo para confirmar. Prefira a versão mais completa que aparecer na conversa.',
  },
  {
    chave: 'clienteRenda',
    rotulo: 'Renda bruta',
    tipo: 'dinheiro',
    grupo: 'cliente',
    essencial: true,
    comoAparece:
      'Renda bruta mensal do proponente principal. "Ganho dois e oitocentos" = 2800. "Três e meio" = 3500. "Um salário" = 1518. Se somarem rendas de duas pessoas, esta é a do titular.',
  },
  {
    chave: 'clienteCpf',
    rotulo: 'CPF',
    tipo: 'cpf',
    grupo: 'cliente',
    essencial: false,
    comoAparece:
      'CPF do proponente principal, ditado em blocos de números. Devolva só os 11 dígitos. Só preencha se ouvir 11 dígitos.',
  },
  {
    chave: 'clienteTelefone',
    rotulo: 'Telefone',
    tipo: 'telefone',
    grupo: 'cliente',
    essencial: false,
    comoAparece: 'Celular do cliente, com DDD. Só os dígitos.',
  },
  {
    chave: 'clienteEmail',
    rotulo: 'E-mail',
    tipo: 'email',
    grupo: 'cliente',
    essencial: false,
    comoAparece:
      'E-mail do cliente. Ditado por voz costuma virar "arroba" e "ponto" escritos por extenso — normalize para o formato de e-mail.',
  },

  // ------------------------------------------------------- segundo proponente
  {
    chave: 'temSegundoProponente',
    rotulo: 'Tem segundo proponente',
    tipo: 'sim_nao',
    grupo: 'segundo',
    essencial: false,
    comoAparece:
      'Se a compra é em duas pessoas: "vai ser comigo e com meu marido", "vou compor renda com minha mãe". Composição de renda implica sim.',
  },
  {
    chave: 'associacao',
    rotulo: 'Vínculo',
    tipo: 'opcao',
    grupo: 'segundo',
    essencial: false,
    opcoes: ['conjuge', 'parente', 'fiador', 'socio'],
    comoAparece:
      'Relação do segundo proponente com o titular. Marido/esposa/companheiro = conjuge. Mãe/pai/irmão/filho = parente.',
  },
  {
    chave: 'segundoNome',
    rotulo: 'Nome do 2º proponente',
    tipo: 'texto',
    grupo: 'segundo',
    essencial: false,
    comoAparece: 'Nome completo da segunda pessoa que entra na compra.',
  },
  {
    chave: 'segundoRenda',
    rotulo: 'Renda do 2º',
    tipo: 'dinheiro',
    grupo: 'segundo',
    essencial: false,
    comoAparece: 'Renda bruta mensal do segundo proponente, nas mesmas regras da renda do titular.',
  },
  {
    chave: 'segundoCpf',
    rotulo: 'CPF do 2º',
    tipo: 'cpf',
    grupo: 'segundo',
    essencial: false,
    comoAparece: 'CPF do segundo proponente, só os 11 dígitos.',
  },

  // ----------------------------------------------------------- financiamento
  {
    chave: 'financiamentoAprovado',
    rotulo: 'Financiamento aprovado',
    tipo: 'dinheiro',
    grupo: 'financiamento',
    essencial: false,
    comoAparece:
      'Quanto a Caixa aprovou de financiamento. "A carta veio 180", "aprovou cento e oitenta mil".',
  },
  {
    chave: 'subsidio',
    rotulo: 'Subsídio',
    tipo: 'dinheiro',
    grupo: 'financiamento',
    essencial: false,
    comoAparece: 'Subsídio do governo (desconto do Minha Casa Minha Vida). "Deu 32 de subsídio".',
  },
  {
    chave: 'fgts',
    rotulo: 'FGTS',
    tipo: 'dinheiro',
    grupo: 'financiamento',
    essencial: false,
    comoAparece: 'Valor de FGTS que o cliente vai usar na compra.',
  },

  // --------------------------------------------------------------- pagamento
  {
    chave: 'ato',
    rotulo: 'Ato (entrada)',
    tipo: 'dinheiro',
    grupo: 'pagamento',
    essencial: false,
    comoAparece:
      'Valor pago no ato da assinatura — a entrada. "Consigo dar cinco mil de entrada", "no ato ele paga 3".',
  },
  {
    chave: 'mensaisQuantidade',
    rotulo: 'Qtd. de mensais',
    tipo: 'inteiro',
    grupo: 'pagamento',
    essencial: false,
    comoAparece: 'Em quantas parcelas mensais o saldo será dividido. "Divide em 36 vezes".',
  },
  {
    chave: 'mensalDiaVencimento',
    rotulo: 'Dia do vencimento',
    tipo: 'dia_do_mes',
    grupo: 'pagamento',
    essencial: false,
    comoAparece: 'Dia do mês em que a parcela vence. "Todo dia 10". Número de 1 a 31.',
  },
  {
    chave: 'semestraisQuantidade',
    rotulo: 'Qtd. de semestrais',
    tipo: 'inteiro',
    grupo: 'pagamento',
    essencial: false,
    comoAparece: 'Quantos reforços semestrais (balões de 6 em 6 meses) entram no fluxo.',
  },
  {
    chave: 'semestralValor',
    rotulo: 'Valor da semestral',
    tipo: 'dinheiro',
    grupo: 'pagamento',
    essencial: false,
    comoAparece: 'Valor de cada reforço semestral.',
  },
  {
    chave: 'anuaisQuantidade',
    rotulo: 'Qtd. de anuais',
    tipo: 'inteiro',
    grupo: 'pagamento',
    essencial: false,
    comoAparece: 'Quantos reforços anuais entram no fluxo.',
  },
  {
    chave: 'anualValor',
    rotulo: 'Valor da anual',
    tipo: 'dinheiro',
    grupo: 'pagamento',
    essencial: false,
    comoAparece: 'Valor de cada reforço anual.',
  },
];

export const CAMPOS_POR_CHAVE: Record<string, CampoLia> = Object.fromEntries(
  CAMPOS.map((c) => [c.chave, c]),
);

export const CHAVES_ESSENCIAIS = CAMPOS.filter((c) => c.essencial).map((c) => c.chave);

/**
 * O recorte da lista que vai para o modelo.
 *
 * `essencial` fica de fora de propósito: é decisão de produto (o que a tela
 * cobra), não informação que ajude a ouvir melhor. Mandar isso ao modelo só
 * criaria a tentação de ele "se esforçar mais" nos essenciais e chutar.
 */
export function campoParaPrompt(c: CampoLia) {
  return {
    chave: c.chave,
    rotulo: c.rotulo,
    tipo: c.tipo,
    comoAparece: c.comoAparece,
    ...(c.opcoes ? { opcoes: c.opcoes } : {}),
  };
}

/* ===========================================================================
 * NORMALIZAÇÃO
 * ===========================================================================
 * O modelo devolve tudo como texto — é o formato que ele acerta. Converter
 * para a forma que cada campo do simulador espera é trabalho local, barato e
 * determinístico, e é aqui que ele acontece.
 */

/** Aceita "250000", "250.000,00", "250000.00" e devolve reais como número. */
function paraNumero(valor: string): number | null {
  const limpo = valor.trim().replace(/[R$\s]/gi, '');
  if (!limpo) return null;
  // "250.000,00" (pt-BR) vs "250000.00" (cru do modelo): a vírgula decide.
  const normal = limpo.includes(',')
    ? limpo.replace(/\./g, '').replace(',', '.')
    : limpo.replace(/\.(?=\d{3}\b)/g, '');
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

/** Reais como número → a máscara que o simulador guarda ("R$ 250.000,00"). */
export function dinheiroParaCampo(valor: string): string | null {
  const n = paraNumero(valor);
  if (n === null || n <= 0) return null;
  return formatCurrencyBRL(String(Math.round(n * 100)));
}

function simNao(valor: string): boolean | null {
  const v = valor.trim().toLowerCase();
  if (['sim', 'true', 'verdadeiro', '1'].includes(v)) return true;
  if (['nao', 'não', 'false', 'falso', '0'].includes(v)) return false;
  return null;
}

function inteiro(valor: string, min: number, max: number): number | null {
  const n = paraNumero(valor);
  if (n === null) return null;
  const i = Math.round(n);
  return i >= min && i <= max ? i : null;
}

/** O que o `LiaProvider` acumulou, na forma bruta (chave → texto). */
export type CapturaBruta = Record<string, string>;

/** Contexto do catálogo, para resolver empreendimento e correspondente. */
export interface ContextoCatalogo {
  /** empreendimentoId → empresaId. É isto que faz a empresa vir de graça. */
  empresaDoEmpreendimento: Record<string, string>;
  /** IDs válidos de correspondente, para não gravar um ID inventado. */
  correspondentes: { id: string; nome: string }[];
}

/**
 * Traduz o que a LIA ouviu para um pedaço de `SimuladorState`.
 *
 * Só entra o que passou pela normalização. Um campo que o modelo devolveu num
 * formato que não dá para converter é **descartado em silêncio** — preencher o
 * simulador com lixo é pior do que deixar o campo vazio, porque o corretor
 * confia no que já está preenchido e não confere.
 */
export function paraSimulador(
  captura: CapturaBruta,
  ctx: ContextoCatalogo,
): Partial<SimuladorState> {
  const out: Partial<SimuladorState> = {};
  const p1: Partial<Proponent> = {};
  const p2: Partial<Proponent> = {};

  const texto = (k: string) => captura[k]?.trim() || null;

  const devId = texto('empreendimento');
  if (devId && ctx.empresaDoEmpreendimento[devId]) {
    out.developmentId = devId;
    // A empresa não é ouvida: ela é consequência do empreendimento.
    out.companyId = ctx.empresaDoEmpreendimento[devId];
  }

  const corr = texto('correspondente');
  if (corr) {
    const achado = ctx.correspondentes.find((c) => c.id === corr);
    if (achado) {
      out.correspondentId = achado.id;
      out.correspondentName = achado.nome;
    }
  }

  const bloco = captura.bloco !== undefined ? inteiro(captura.bloco, 0, 100) : null;
  if (bloco !== null) out.block = bloco;

  const unidade = texto('unidade');
  if (unidade) out.unit = unidade;

  const valor = captura.valorUnidade ? dinheiroParaCampo(captura.valorUnidade) : null;
  if (valor) out.unitValue = valor;

  const nome = texto('clienteNome');
  if (nome) p1.name = nome;

  const renda = captura.clienteRenda ? dinheiroParaCampo(captura.clienteRenda) : null;
  if (renda) p1.rendaBruta = renda;

  const cpf = captura.clienteCpf ? cpfDigits(captura.clienteCpf) : '';
  if (cpf.length === 11) p1.cpf = cpf;

  const fone = captura.clienteTelefone ? cpfDigits(captura.clienteTelefone) : '';
  if (fone.length >= 10) p1.contact = fone;

  const email = texto('clienteEmail');
  if (email?.includes('@')) p1.email = email;

  const temSegundo = captura.temSegundoProponente
    ? simNao(captura.temSegundoProponente)
    : null;
  if (temSegundo !== null) out.hasSecondProponent = temSegundo;

  const assoc = texto('associacao');
  if (assoc && ['conjuge', 'parente', 'fiador', 'socio'].includes(assoc)) {
    out.association = assoc as SimuladorState['association'];
  }

  const n2 = texto('segundoNome');
  if (n2) p2.name = n2;
  const r2 = captura.segundoRenda ? dinheiroParaCampo(captura.segundoRenda) : null;
  if (r2) p2.rendaBruta = r2;
  const c2 = captura.segundoCpf ? cpfDigits(captura.segundoCpf) : '';
  if (c2.length === 11) p2.cpf = c2;

  // Ter nome ou renda do segundo implica que ele existe, mesmo que ninguém
  // tenha dito "sim, tem segundo proponente" com todas as letras.
  if (Object.keys(p2).length > 0) out.hasSecondProponent = true;

  const dinheiroSimples: [string, keyof SimuladorState][] = [
    ['financiamentoAprovado', 'financingApproved'],
    ['subsidio', 'subsidy'],
    ['fgts', 'fgts'],
    ['ato', 'ato'],
    ['semestralValor', 'semestralValue'],
    ['anualValor', 'anualValue'],
  ];
  for (const [origem, destino] of dinheiroSimples) {
    const m = captura[origem] ? dinheiroParaCampo(captura[origem]!) : null;
    if (m) (out as Record<string, unknown>)[destino] = m;
  }

  const mensais = captura.mensaisQuantidade ? inteiro(captura.mensaisQuantidade, 1, 420) : null;
  if (mensais !== null) out.mensaisCount = String(mensais);

  const dia = captura.mensalDiaVencimento ? inteiro(captura.mensalDiaVencimento, 1, 31) : null;
  if (dia !== null) out.mensalDueDay = String(dia);

  const sem = captura.semestraisQuantidade ? inteiro(captura.semestraisQuantidade, 1, 60) : null;
  if (sem !== null) {
    out.semestralCount = String(sem);
    out.semestralEnabled = true;
  }

  const anu = captura.anuaisQuantidade ? inteiro(captura.anuaisQuantidade, 1, 30) : null;
  if (anu !== null) {
    out.anualCount = String(anu);
    out.anualEnabled = true;
  }

  if (Object.keys(p1).length > 0) out.proponent1 = p1 as Proponent;
  if (Object.keys(p2).length > 0) out.proponent2 = p2 as Proponent;

  return out;
}
