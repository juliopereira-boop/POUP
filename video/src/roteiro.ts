/**
 * O ROTEIRO DO USO DO APP (v2, 45 s) — todos os quadros num lugar só.
 *
 * `s` = quadro local da cena de uso (0 = quadro 360 do vídeo). As telas e os
 * efeitos sonoros leem daqui, então mudar um tempo aqui mexe nos dois juntos.
 *
 * O dia de um corretor, do jeito que o POUP faz:
 *   C1   0–110  simular o financiamento → "Levar para o simulador de vendas"
 *   C2 110–260  tabela de preço (bloco e unidade) + a LIA preenche a simulação
 *   C3 260–360  a proposta em PDF vai para o WhatsApp; o cliente topa
 *   C4 360–450  a LIA agenda a visita; o celular avisa com a notificação
 *   C5 450–550  registrar a venda: a comissão sai calculada pela regra
 *   C6 550–640  o corretor sobe no ranking
 *   C7 640–750  tudo em Relatórios; os papéis do "antes" são varridos
 */
export const C = {
  financiamento: 0,
  vendas: 110,
  proposta: 260,
  agenda: 360,
  comissao: 450,
  ranking: 550,
  relatorios: 640,
  fim: 750,
} as const;

export const T = {
  // C1 — simular financiamento
  campo: (k: number) => 12 + k * 8,
  simular: 62,
  cartoes: [70, 73, 76, 79],
  selo: 84,
  levarParaVendas: 98,

  // C2 — simulador de vendas + tabela de preço + LIA
  usarTabela: 124,
  bloco: 142,
  unidade: 160,
  liaAbre: 178,
  liaTexto: 184, // começa a digitar
  liaAnalisa: 208,
  liaFecha: 216,
  preenche: (k: number) => 218 + k * 4, // financiamento, subsídio, FGTS, ato, mensais
  parcelaRola: [222, 242] as const,
  riscoOk: 244,

  // C3 — proposta no WhatsApp
  gerarProposta: 262,
  pdfVoa: [266, 286] as const,
  lido: 292,
  digitando: [294, 312] as const,
  resposta: 314,

  // C4 — LIA agenda + notificação
  liaAgenda: 362,
  agendaTexto: 370,
  agendado: 398,
  bloqueia: 414,
  notificacao: 422,

  // C5 — registrar venda + comissão
  registrarAbre: 452,
  comissaoCalc: [462, 476] as const,
  registrar: 490,
  totalRola: [500, 522] as const,

  // C6 — ranking
  rankingEntra: 552,
  sobe: [576, 598] as const,

  // C7 — relatórios
  itens: (k: number) => 646 + k * 3,
  filtro: 672,
  papeisVoltam: [688, 698] as const,
  varre: [698, 712] as const,
} as const;

/** Valores ilustrativos, coerentes entre as telas. */
export const V = {
  imovel: 210_000,
  entrada: 12_000,
  fgts: 10_000,
  subsidio: 20_000,
  renda: 3_200,
  idade: 29,
  prazoAnos: 35,
  parcelaFin: 958.4,
  // simulador de vendas (proposta da construtora)
  empreendimento: 'Residencial Jardins',
  bloco: 'Bloco 2',
  unidade: '301',
  valorVenda: 244_780,
  financiamentoAprovado: 180_000,
  ato: 6_000,
  mensais: 36,
  riscoConstrutora: 20,
  // comissão
  comissaoPct: 4,
  totalAReceberAntes: 8_640,
} as const;

export const POUPANCA = V.valorVenda - V.financiamentoAprovado - V.subsidio - V.fgts; // 34.780
export const PARCELA_MENSAL = Math.round(((POUPANCA - V.ato) / V.mensais) * 100) / 100; // 799,44
export const RISCO_PCT = (POUPANCA / V.valorVenda) * 100; // 14,2%
export const COMISSAO = Math.round(V.valorVenda * V.comissaoPct) / 100; // 9.791,20
export const FINANCIADO = V.imovel - V.entrada - V.fgts - V.subsidio; // 168.000
