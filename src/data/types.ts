import { friendlyError } from './friendlyError';

import type { SimuladorState } from '@/features/simulador/SimuladorProvider';

export interface AuthUser {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface UserProfile {
  id: string;
  fullName: string | null;
  agency: string | null;
  agencyManager: string | null;
  cnpj: string | null;
  cpf: string | null;
  phone: string | null;
  avatarUrl: string | null;
  creci: string | null;
  /**
   * UF em que o corretor atua (sigla de 2 letras).
   *
   * É o que decide quais empreendimentos do catálogo aparecem para ele: quem
   * atua no MA não vê unidade de Fortaleza. `null` = ainda não escolheu, e aí
   * nada é filtrado.
   */
  uf: string | null;
  createdAt: string;
  updatedAt: string;
}

export function isProfileComplete(p: UserProfile | null): boolean {
  if (!p) return false;
  return Boolean(
    p.fullName?.trim() &&
      p.agency?.trim() &&
      p.cnpj?.trim() &&
      p.cpf?.trim() &&
      p.phone?.trim() &&
      // Sem UF o app não sabe quais empreendimentos do catálogo mostrar, então
      // ela entra como obrigatória: quem já tinha conta preenche na próxima vez
      // que abrir o app.
      p.uf?.trim(),
  );
}

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'none';

/**
 * Os três planos.
 *
 * A ordem da união é a ordem comercial (mais barato → mais completo), e vários
 * lugares dependem disso para achar "o plano mais barato que tem tal recurso".
 */
export type PlanTier = 'start' | 'intermed' | 'pro';

export interface Subscription {
  status: SubscriptionStatus;
  tier: PlanTier | null;
  plan: string | null;
  storageLimitBytes: number;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /**
   * Quando o período de teste gratuito foi concedido a esta conta.
   * `null` = a conta NUNCA usou o teste (é candidata a receber um, se a
   * campanha estiver ligada). Preenchido = já usou, e nunca ganha outro.
   */
  trialStartedAt: string | null;
}

/**
 * A conta ainda pode ganhar o teste gratuito: está sem acesso e nunca usou o
 * teste. Só o banco decide de fato (a campanha precisa estar ligada) — isto é
 * apenas o filtro barato do lado do app, para não chamar a RPC à toa.
 */
export function isTrialGrantCandidate(sub: Subscription | null): boolean {
  if (isSubscriptionActive(sub)) return false;
  // Sem linha de assinatura o app não sabe nada: vale tentar.
  if (!sub) return true;
  return sub.trialStartedAt === null;
}

export interface StorageUsage {
  usedBytes: number;
  limitBytes: number;
}

/**
 * O conteúdo de um arquivo, no formato que o Storage aceita **em cada
 * plataforma**. Não é preciosismo de tipo: é um bug de verdade.
 *
 * O `supabase-js` embrulha todo `Blob` num `FormData` antes de enviar. No
 * navegador isso é o certo. No React Native o `FormData` **não sabe serializar
 * um `Blob`** — ele só entende `string` e o objeto `{ uri, name, type }` do
 * próprio RN. O upload então é aceito com corpo vazio: nenhum erro volta, a
 * URL pública é gravada, e o arquivo simplesmente não existe. A biblioteca
 * documenta isso na própria fonte:
 *
 *   "For React Native, using either Blob, File or FormData does not work as
 *    intended. Upload file using ArrayBuffer from base64 file data instead."
 *
 * Daí a união: `Blob` na web (o navegador transmite sem copiar) e
 * `ArrayBuffer` no celular, que cai no caminho de corpo cru do `supabase-js`,
 * com o `content-type` mandado no cabeçalho.
 *
 * Quem escolhe é `src/features/files/pick.ts`; as telas só repassam.
 */
export type UploadBody = Blob | ArrayBuffer;

/**
 * Data em que o período de teste gratuito vence.
 * `null` quando a assinatura não está em teste ou não tem vencimento gravado.
 */
export function trialEndsAt(sub: Subscription | null): Date | null {
  if (!sub || sub.status !== 'trialing' || !sub.currentPeriodEnd) return null;
  const end = new Date(sub.currentPeriodEnd);
  return Number.isNaN(end.getTime()) ? null : end;
}

/** Teste gratuito ainda dentro do prazo. */
export function isTrialActive(sub: Subscription | null, now: number = Date.now()): boolean {
  const end = trialEndsAt(sub);
  return end !== null && end.getTime() > now;
}

/** Teste gratuito que já venceu — o acesso fica travado até assinar. */
export function isTrialExpired(sub: Subscription | null, now: number = Date.now()): boolean {
  if (!sub || sub.status !== 'trialing') return false;
  return !isTrialActive(sub, now);
}

/**
 * Dias inteiros que ainda faltam do teste (arredondando para cima, mínimo 1
 * enquanto o teste é válido). `null` quando não há teste válido.
 */
export function trialDaysRemaining(
  sub: Subscription | null,
  now: number = Date.now(),
): number | null {
  const end = trialEndsAt(sub);
  if (!end || end.getTime() <= now) return null;
  return Math.max(1, Math.ceil((end.getTime() - now) / 86_400_000));
}

export function isSubscriptionActive(sub: Subscription | null): boolean {
  if (!sub) return false;
  // Assinatura paga no Stripe: liberada.
  if (sub.status === 'active') return true;
  // Período de teste: liberado apenas enquanto não vence.
  if (sub.status === 'trialing') return isTrialActive(sub);
  return false;
}

/** Campanha global de período de teste gratuito (uma única configuração). */
export interface TrialCampaign {
  enabled: boolean;
  trialDays: number;
  updatedAt: string | null;
}

export type TrialCampaignInput = Pick<TrialCampaign, 'enabled' | 'trialDays'>;

export const TRIAL_DAYS_MIN = 1;
export const TRIAL_DAYS_MAX = 90;

export function isValidTrialDays(days: number): boolean {
  return Number.isInteger(days) && days >= TRIAL_DAYS_MIN && days <= TRIAL_DAYS_MAX;
}

export interface Company {
  id: string;
  name: string;
  risk: number | null;
  maxInstallments: number | null;
  maxSemiannual: number | null;
  maxAnnual: number | null;
  coincideInstallments: boolean;
  /**
   * Foto redonda da construtora (URL pública do bucket `catalog`).
   * Aparece na listagem, no seletor do simulador e no topo do PDF da proposta.
   */
  photoUrl: string | null;
  /**
   * Veio do CATÁLOGO DO SISTEMA, mantido pelo admin do POUP.
   *
   * O corretor não edita nem apaga: ele **adota** a empresa e passa a usar as
   * regras, os empreendimentos e o material que o admin cadastrou — e continua
   * recebendo as atualizações, porque a adoção é um VÍNCULO, não uma cópia.
   * Para deixar de usar, ele remove a adoção (`db.catalog.unadopt`).
   */
  isCatalog: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Uma empresa do catálogo do sistema, do ponto de vista de quem vai adotar.
 *
 * `developmentNames` é só a prévia mostrada no aviso de aceite — o corretor
 * precisa ver o que vai entrar na conta dele ANTES de confirmar.
 */
export interface CatalogCompany {
  company: Company;
  developmentCount: number;
  /** Primeiros nomes, para a prévia. Não é a lista completa. */
  developmentNames: string[];
  /** Resumo da regra de comissão em uma linha, ou `null` se não houver regra. */
  commissionSummary: string | null;
  /**
   * Os estados em que esta construtora tem empreendimento, derivados dos
   * próprios empreendimentos — nunca um campo digitado, que ficaria
   * desatualizado assim que uma obra nova entrasse.
   */
  ufs: string[];
  /** O corretor logado já adotou esta empresa. */
  adopted: boolean;
}

/** O que o admin pode fotografar. Define a pasta no bucket `catalog`. */
export type CatalogPhotoKind = 'company' | 'development';

export interface Correspondent {
  id: string;
  companyId: string;
  name: string;
}

export interface Development {
  id: string;
  companyId: string;
  name: string;
  companyName?: string | null;
  description: string | null;
  deliveryDate: string | null;
  managerName: string | null;
  /**
   * UF onde o empreendimento fica (sigla de 2 letras).
   *
   * `null` = sem restrição: aparece para corretor de qualquer estado. Some da
   * lista de quem atua em OUTRA UF — por isso mora aqui e não na empresa: a
   * mesma construtora tem obra em estados diferentes.
   */
  uf: string | null;
  /** Foto redonda do empreendimento (URL pública do bucket `catalog`). */
  photoUrl: string | null;
  /**
   * Valor "a partir de" da unidade, em reais. `null` = não cadastrado.
   *
   * É preço do EMPREENDIMENTO, não da unidade: o POUP não tem espelho de
   * vendas, e a unidade é digitada livre na simulação. Uma coluna resolve a
   * pergunta comercial que importa — "o que cabe em R$ 250 mil?" — sem
   * arrastar um módulo inteiro de estoque.
   *
   * Sem valor, o empreendimento fica FORA da lista de unidades compatíveis do
   * poder de compra: não dá para afirmar que cabe nem que não cabe.
   */
  unitValueFrom: number | null;
  /**
   * Pertence a uma empresa do catálogo do sistema — logo, é somente leitura
   * para o corretor. Derivado da empresa, não é coluna própria no banco.
   */
  isCatalog: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyInput {
  name: string;
  risk: number | null;
  maxInstallments: number | null;
  maxSemiannual: number | null;
  maxAnnual: number | null;
  coincideInstallments: boolean;
}

export interface DevelopmentInput {
  companyId: string;
  name: string;
  description: string | null;
  deliveryDate: string | null;
  managerName: string | null;
  /** UF do empreendimento. `null` = aparece para corretor de qualquer estado. */
  uf: string | null;
  /** Valor "a partir de" da unidade, em reais. `null` = não cadastrado. */
  unitValueFrom: number | null;
}

export interface CompanyMaterial {
  companyId: string;
  driveUrl: string | null;
}

export interface Simulation {
  id: string;
  clientName: string | null;
  companyId: string | null;
  companyName: string | null;
  developmentId: string | null;
  developmentName: string | null;
  monthlyValue: number | null;
  riskPct: number | null;
  withinRisk: boolean | null;
  unitValue: number | null;
  deliveryDate: string | null;
  managerName: string | null;
  proposalDate: string | null;
  state: SimuladorState;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/** Ciclo de vida da simulação. `venda_realizada` é gravado pelo módulo de vendas. */
export type SimulationStatus = 'simulacao' | 'venda_realizada';

export type SimulationInput = Omit<
  Simulation,
  'id' | 'status' | 'createdAt' | 'updatedAt'
>;

/* ------------------------------------------------------------------------- *
 * Simulação de FINANCIAMENTO habitacional
 * ------------------------------------------------------------------------- *
 * É outra tabela, e não um campo a mais em `Simulation`, porque são duas
 * perguntas diferentes:
 *
 *   `Simulation`          — o fluxo de pagamento da CONSTRUTORA (a poupança):
 *                           ato, mensais, semestrais, anuais.
 *   `FinancingSimulation` — o financiamento do BANCO: quota, prazo, sistema de
 *                           amortização, enquadramento.
 *
 * As duas se encontram no CLIENTE (`leadId`), e é por isso que o vínculo com o
 * lead está nas duas: feito o financiamento, o simulador de poupança já abre
 * com o valor aprovado, o subsídio e o FGTS preenchidos.
 * ------------------------------------------------------------------------- */

export interface FinancingSimulation {
  id: string;
  /** O cliente. É por ele que os dados viajam entre os dois simuladores. */
  leadId: string | null;
  clientName: string | null;
  companyId: string | null;
  developmentId: string | null;
  developmentName: string | null;
  block: number | null;
  unit: string | null;

  /** `EntradaSimulacao` serializada (centavos como número). */
  input: unknown;
  /** `ResultadoSimulacao` sem a tabela de parcelas, que é regerada. */
  result: unknown;
  /**
   * A versão de regras congelada no momento da simulação.
   *
   * Redundante de propósito: sem ela, mudar a taxa amanhã recalcularia em
   * silêncio a proposta que o cliente recebeu ontem.
   */
  rulesSnapshot: unknown;
  ruleVersion: string;

  /* espelhados do resultado, para listar e filtrar sem abrir o JSON */
  propertyValue: number | null;
  financedValue: number | null;
  firstInstallment: number | null;
  termMonths: number | null;
  amortization: string | null;
  eligible: boolean | null;

  status: string;
  createdAt: string;
  updatedAt: string;
}

export type FinancingSimulationInput = Omit<
  FinancingSimulation,
  'id' | 'status' | 'createdAt' | 'updatedAt'
>;

/** Link público e expirável de uma simulação de financiamento. */
export interface FinancingShareLink {
  id: string;
  simulationId: string;
  /**
   * A URL completa, montada com o token em claro.
   *
   * Só existe no INSTANTE da criação: o banco guarda apenas o hash, então esta
   * é a única vez em que o link pode ser lido. Perdeu, gera outro.
   */
  url: string;
  expiresAt: string;
}

/* ------------------------------------------------------------------------- *
 * Comissão — regras (ficam no cadastro da construtora)
 * ------------------------------------------------------------------------- */

/**
 * Como a comissão de uma construtora é calculada e paga.
 *
 * Uma regra por empresa. O percentual padrão vale sempre; campanhas
 * (`CommissionCampaign`) sobrepõem o padrão dentro do período delas.
 */
export interface CommissionRule {
  companyId: string;
  /** % sobre o valor da unidade. Ex.: 2 = 2%. */
  defaultPct: number;
  /** Em quantas parcelas a comissão é paga. 1 = pagamento único. */
  installmentsCount: number;
  /**
   * Percentual de cada parcela, na ordem. Ex.: `[60, 40]`.
   * `null` ou vazio = divide igualmente entre as parcelas.
   * Quando informado, precisa ter `installmentsCount` itens e somar 100.
   */
  installmentsSplit: number[] | null;
  /** Dias após a data da venda para a 1ª parcela vencer. */
  firstPaymentDays: number;
  /** Dias entre uma parcela e a seguinte. */
  intervalDays: number;
  notes: string | null;
  updatedAt: string;
}

export type CommissionRuleInput = Omit<CommissionRule, 'companyId' | 'updatedAt'>;

/** Percentual promocional com prazo, que ganha do padrão enquanto estiver valendo. */
export interface CommissionCampaign {
  id: string;
  companyId: string;
  name: string;
  pct: number;
  /** YYYY-MM-DD, inclusivo nas duas pontas. */
  startsOn: string;
  endsOn: string;
  createdAt: string;
}

export type CommissionCampaignInput = Omit<CommissionCampaign, 'id' | 'companyId' | 'createdAt'>;

export const DEFAULT_COMMISSION_RULE: CommissionRuleInput = {
  defaultPct: 2,
  installmentsCount: 1,
  installmentsSplit: null,
  firstPaymentDays: 30,
  intervalDays: 30,
  notes: null,
};

/* ------------------------------------------------------------------------- *
 * Comissão — a comissão de uma venda e suas parcelas
 * ------------------------------------------------------------------------- */

/** De onde saiu o percentual aplicado. Fica gravado para o histórico não mudar. */
export type CommissionSource = 'padrao' | 'campanha' | 'manual';

export type CommissionInstallmentStatus = 'pendente' | 'recebida' | 'cancelada';

/** Situação da nota fiscal da parcela. A emissão automática entra depois. */
export type InvoiceStatus = 'nao_emitida' | 'emitida' | 'cancelada';

/**
 * A comissão de uma venda. Criada automaticamente quando a venda é
 * registrada, aplicando a regra da construtora vigente na data da venda.
 */
export interface Commission {
  id: string;
  saleId: string;
  companyId: string | null;
  /** Snapshots: o histórico não pode mudar se o cadastro for editado depois. */
  companyName: string | null;
  developmentName: string | null;
  clientName: string;
  saleValue: number;
  saleDate: string;
  pct: number;
  source: CommissionSource;
  /** Nome da campanha, quando `source = 'campanha'`. */
  campaignName: string | null;
  totalValue: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommissionInstallment {
  id: string;
  commissionId: string;
  /** 1, 2, 3… na ordem de vencimento. */
  number: number;
  dueDate: string;
  value: number;
  status: CommissionInstallmentStatus;
  paidDate: string | null;
  /** O que entrou de fato. Pode divergir do previsto. */
  paidValue: number | null;
  invoiceStatus: InvoiceStatus;
  invoiceNumber: string | null;
  invoiceUrl: string | null;
  invoiceIssuedAt: string | null;
  notes: string | null;
}

/** Uma comissão junto com suas parcelas — é assim que a tela consome. */
export interface CommissionWithInstallments {
  commission: Commission;
  installments: CommissionInstallment[];
}

/**
 * Períodos do módulo de comissão.
 *
 * NÃO é o mesmo conjunto de vendas, e a diferença é o coração do módulo: venda
 * é fato consumado (olha para trás), comissão a receber é PREVISÃO (olha para
 * frente). Uma venda registrada hoje tem a 1ª parcela vencendo daqui a 30 dias
 * — com uma janela que termina hoje, ela sumiria da tela no instante em que foi
 * criada. Por isso o padrão é `tudo` e existem os presets prospectivos.
 */
export type CommissionPeriodPreset =
  | 'tudo'
  | 'proximos_30_dias'
  | 'proximos_3_meses'
  | 'proximos_12_meses'
  | 'mes_atual'
  | 'mes_passado'
  | 'ultimos_3_meses'
  | 'ultimos_12_meses'
  | 'ano_atual'
  | 'personalizado';

export type CommissionDateBasis = 'vencimento' | 'venda' | 'recebimento';

export interface CommissionFilters {
  preset: CommissionPeriodPreset;
  from: string | null;
  to: string | null;
  /** Qual data o período filtra. Trocar isso muda a leitura do painel. */
  basis: CommissionDateBasis;
  companyId: string | null;
  status: CommissionInstallmentStatus | 'todas';
  /** `true` = só parcelas vencidas e não recebidas. */
  onlyLate: boolean;
  query: string;
}

export const EMPTY_COMMISSION_FILTERS: CommissionFilters = {
  // `tudo` de propósito: o corretor precisa ENXERGAR a comissão que acabou de
  // nascer, e ela vence no futuro. Nenhum filtro de data vem ligado por padrão.
  preset: 'tudo',
  from: null,
  to: null,
  basis: 'vencimento',
  companyId: null,
  status: 'todas',
  onlyLate: false,
  query: '',
};

/** Parcela atrasada: venceu, não foi recebida e não foi cancelada. */
export function isInstallmentLate(inst: CommissionInstallment, todayYmd: string): boolean {
  return inst.status === 'pendente' && inst.dueDate < todayYmd;
}

/* ------------------------------------------------------------------------- *
 * Vendas realizadas
 * ------------------------------------------------------------------------- */

export type SaleStatus = 'ativa' | 'distratada';

/**
 * Uma venda fechada. Nasce de uma simulação (botão "Venda realizada" no
 * relatório) ou de um cadastro manual. Os nomes de empresa/empreendimento são
 * gravados junto (snapshot) para o histórico não mudar se o cadastro for
 * editado ou apagado depois.
 */
export interface Sale {
  id: string;
  simulationId: string | null;
  leadId: string | null;

  clientName: string;
  clientCpf: string | null;
  clientPhone: string | null;
  clientEmail: string | null;

  companyId: string | null;
  companyName: string | null;
  developmentId: string | null;
  developmentName: string | null;
  block: number | null;
  unit: string | null;

  /** Valor total da venda (VGV desta unidade). */
  saleValue: number;
  financedValue: number | null;
  subsidyValue: number | null;
  fgtsValue: number | null;
  /** Ato + parcelas pagas direto à construtora. */
  ownResourcesValue: number | null;

  commissionPct: number | null;
  commissionValue: number | null;

  /** Data do fechamento (YYYY-MM-DD, sempre em partes locais). */
  saleDate: string;
  status: SaleStatus;
  distratoDate: string | null;
  distratoReason: string | null;

  /**
   * Quando o atendimento começou (criação do lead ou da simulação).
   * Guardado junto para o ciclo médio de venda não depender de o lead existir.
   */
  originStartedAt: string | null;

  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SaleInput = Omit<Sale, 'id' | 'createdAt' | 'updatedAt'>;

export type SalePeriodPreset =
  | 'mes_atual'
  | 'mes_passado'
  | 'ultimos_3_meses'
  | 'ultimos_12_meses'
  | 'ano_atual'
  | 'tudo'
  | 'personalizado';

export interface SaleFilters {
  preset: SalePeriodPreset;
  /** YYYY-MM-DD inclusivo. `null` = sem limite. */
  from: string | null;
  to: string | null;
  companyId: string | null;
  developmentId: string | null;
  status: SaleStatus | 'todas';
  /** Busca livre por nome do cliente, CPF ou unidade. */
  query: string;
}

export const EMPTY_SALE_FILTERS: SaleFilters = {
  preset: 'ultimos_12_meses',
  from: null,
  to: null,
  companyId: null,
  developmentId: null,
  status: 'ativa',
  query: '',
};

export type LeadSource = 'landing' | 'whatsapp' | 'prospeccao' | 'meta' | 'manual';
export type LeadStatus = 'novo' | 'em_contato' | 'convertido' | 'perdido';

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  message: string | null;
  source: LeadSource;
  companyId: string | null;
  companyName?: string | null;
  developmentId: string | null;
  developmentName?: string | null;
  status: LeadStatus;
  stageId: string | null;
  cpf: string | null;
  income: number | null;
  birthDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadPatch {
  name?: string;
  phone?: string;
  email?: string | null;
  cpf?: string | null;
  income?: number | null;
  birthDate?: string | null;
  notes?: string | null;
  companyId?: string | null;
  developmentId?: string | null;
  stageId?: string | null;
}

export interface LeadStage {
  id: string;
  nome: string;
  cor: string;
  ordem: number;
  ativo: boolean;
  /** Etapa-destino automática quando um agendamento é criado para o lead. */
  isAgendamento: boolean;
  /** Etapa-destino automática quando uma simulação é iniciada para o lead. */
  isSimulacao: boolean;
}

export interface LeadStageInput {
  nome: string;
  cor: string;
  ordem: number;
  ativo?: boolean;
  isAgendamento?: boolean;
  isSimulacao?: boolean;
}

/** Automações de etapa disponíveis (no máximo uma etapa por flag). */
export type LeadStageFlag = 'agendamento' | 'simulacao';

export const DEFAULT_LEAD_STAGES: LeadStageInput[] = [
  { nome: 'Novo', cor: '#6B7280', ordem: 1 },
  { nome: 'Em contato', cor: '#FF751F', ordem: 2 },
  { nome: 'Agendado', cor: '#0891B2', ordem: 3, isAgendamento: true },
  { nome: 'Em simulação', cor: '#2563EB', ordem: 4, isSimulacao: true },
  { nome: 'Proposta', cor: '#7C3AED', ordem: 5 },
  { nome: 'Convertido', cor: '#16A34A', ordem: 6 },
  { nome: 'Perdido', cor: '#DC2626', ordem: 7 },
];

export interface LeadCampaign {
  titulo: string;
  subtitulo: string;
  descricao: string;
  beneficios: string[];
  convite: string;
}

export interface StorageEntry {
  name: string;
  path: string;
  isFolder: boolean;
  size: number | null;
  updatedAt: string | null;
  mimeType: string | null;
}

export interface AppointmentType {
  id: string;
  nome: string;
  cor: string;
  icone: string | null;
}

export interface AppointmentStatusInfo {
  id: string;
  nome: string;
  cor: string;
}

export type AppointmentPriority = 'baixa' | 'normal' | 'alta' | 'urgente';
export type AppointmentSource =
  | 'manual'
  | 'sistema'
  | 'automacao'
  | 'api'
  | 'lead'
  | 'venda'
  | 'comissao'
  | 'financeiro'
  /** Criado pela LIA a partir de um comando de voz ("agenda para o dia..."). */
  | 'lia';

export interface Appointment {
  id: string;
  title: string;
  description: string | null;
  typeId: string;
  statusId: string;
  leadId: string | null;
  leadName?: string | null;
  companyId: string | null;
  companyName?: string | null;
  developmentId: string | null;
  developmentName?: string | null;
  startAt: string;
  endAt: string | null;
  location: string | null;
  priority: AppointmentPriority;
  reminderMinutes: number[];
  source: AppointmentSource;
  completedAt: string | null;
  completedNote: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentInput {
  title: string;
  description?: string | null;
  typeId: string;
  leadId?: string | null;
  companyId?: string | null;
  developmentId?: string | null;
  startAt: string;
  endAt?: string | null;
  location?: string | null;
  priority?: AppointmentPriority;
  reminderMinutes?: number[];
  source?: AppointmentSource;
}

export function isAppointmentLate(a: Appointment): boolean {
  if (a.statusId === 'concluido' || a.statusId === 'cancelado') return false;
  return new Date(a.startAt).getTime() < Date.now();
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

/**
 * Um erro pronto para a tela.
 *
 * A mensagem passa por `friendlyError` aqui, no ponto único por onde TODA
 * falha do app sai. Antes, cada repositório devolvia o texto cru do
 * Postgres/PostgREST e as telas o exibiam sem filtro — o corretor via
 * "duplicate key value violates unique constraint". Veja
 * `src/data/friendlyError.ts` para o porquê e para o cuidado de não estragar
 * as mensagens que já estavam escritas em português.
 */
export function err<T = never>(error: string): Result<T> {
  return { ok: false, error: friendlyError(error) };
}
