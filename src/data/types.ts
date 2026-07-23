/**
 * Modelos de domínio do POUP — independentes de qualquer banco.
 *
 * A UI e a lógica de negócio usam SOMENTE estes tipos. Cada implementação de
 * repositório (Supabase hoje, outro banco amanhã) é responsável por mapear
 * suas linhas para estes modelos.
 */
import type { SimuladorState } from '@/features/simulador/SimuladorProvider';

export interface AuthUser {
  id: string;
  email: string | null;
  /** Nome vindo do provedor OAuth (ex.: Google), quando houver. */
  displayName: string | null;
  avatarUrl: string | null;
}

export interface UserProfile {
  id: string;
  fullName: string | null;
  /** Imobiliária onde o corretor atua. */
  agency: string | null;
  /** Gerente da imobiliária do corretor. */
  agencyManager: string | null;
  /** CNPJ (da imobiliária/corretor). */
  cnpj: string | null;
  phone: string | null;
  avatarUrl: string | null;
  /** Registro CRECI do corretor. */
  creci: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Campos obrigatórios do cadastro do corretor (para o onboarding). */
export function isProfileComplete(p: UserProfile | null): boolean {
  if (!p) return false;
  return Boolean(p.fullName?.trim() && p.agency?.trim() && p.cnpj?.trim() && p.phone?.trim());
}

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'none';

/** Planos de contratação. Diferencial principal: limite de armazenamento. */
export type PlanTier = 'start' | 'pro';

export interface Subscription {
  status: SubscriptionStatus;
  /** Nível do plano contratado (start/pro). */
  tier: PlanTier | null;
  /** Price ID do Stripe (referência técnica). */
  plan: string | null;
  /** Limite de armazenamento gravado no banco (bytes). */
  storageLimitBytes: number;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

/** Uso de armazenamento do usuário (para exibir "X de Y GB"). */
export interface StorageUsage {
  usedBytes: number;
  limitBytes: number;
}

/** Assinatura considerada válida para liberar o acesso ao app. */
export function isSubscriptionActive(sub: Subscription | null): boolean {
  if (!sub) return false;
  return sub.status === 'active' || sub.status === 'trialing';
}

/**
 * Empresa / construtora cadastrada pelo corretor.
 * `risk` (Risco) é o risco da poupança daquela construtora — usado como
 * parâmetro de cálculo no Simulador de poupança (detalhamento em breve).
 */
export interface Company {
  id: string;
  name: string;
  /** Risco da poupança da construtora, em % (parâmetro de cálculo). */
  risk: number | null;
  // Regras de negócio:
  /** Qtd máxima de parcelas mensais. */
  maxInstallments: number | null;
  /** Qtd máxima de parcelas semestrais. */
  maxSemiannual: number | null;
  /** Qtd máxima de parcelas anuais. */
  maxAnnual: number | null;
  /** Se semestrais/anuais podem coincidir com as mensais. */
  coincideInstallments: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Correspondente bancário vinculado a uma empresa. */
export interface Correspondent {
  id: string;
  companyId: string;
  name: string;
}

/** Empreendimento, sempre associado a uma empresa. */
export interface Development {
  id: string;
  companyId: string;
  name: string;
  /** Nome da empresa (preenchido em consultas com join), quando disponível. */
  companyName?: string | null;
  // Regras de negócio:
  /** Data de entrega (ISO yyyy-mm-dd). */
  deliveryDate: string | null;
  /** Gerente responsável (facultativo). */
  managerName: string | null;
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
  deliveryDate: string | null;
  managerName: string | null;
}

/**
 * Uma simulação CONCLUÍDA, exibida na aba de Relatórios.
 *
 * Guarda o resumo (para listagem/filtros), um snapshot dos dados resolvidos
 * dos cadastros (para o PDF permanecer fiel) e o `state` completo do simulador
 * (para reabrir/editar e REGERAR o PDF sob demanda — o PDF nunca é armazenado).
 */
export interface Simulation {
  id: string;
  /** Nome do 1º proponente (para a listagem e o filtro por cliente). */
  clientName: string | null;
  companyId: string | null;
  companyName: string | null;
  developmentId: string | null;
  developmentName: string | null;
  /** Valor da parcela mensal calculado (destaque do card). */
  monthlyValue: number | null;
  /** % da poupança sobre o valor da unidade. */
  riskPct: number | null;
  /** Se ficou dentro do risco da empresa. */
  withinRisk: boolean | null;
  unitValue: number | null;
  /** Snapshots para regerar o PDF fielmente. */
  deliveryDate: string | null;
  managerName: string | null;
  /** Data usada como "hoje" na geração original. */
  proposalDate: string | null;
  /** Estado completo do simulador (para reabrir/editar/regerar). */
  state: SimuladorState;
  /** Ciclo de vida: 'simulacao' | 'venda_realizada' (uso futuro). */
  status: string;
  createdAt: string;
  updatedAt: string;
}

/** Dados para criar/atualizar uma simulação (sem os campos gerados pelo banco). */
export type SimulationInput = Omit<
  Simulation,
  'id' | 'status' | 'createdAt' | 'updatedAt'
>;

/** Origem do lead. */
export type LeadSource = 'landing' | 'whatsapp' | 'prospeccao' | 'meta' | 'manual';
/** Ciclo de vida simples do lead. */
export type LeadStatus = 'novo' | 'em_contato' | 'convertido' | 'perdido';

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  message: string | null;
  source: LeadSource;
  companyId: string | null;
  /** Preenchido em consultas com join. */
  companyName?: string | null;
  developmentId: string | null;
  developmentName?: string | null;
  status: LeadStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Textos de captação gerados pela IA para o corretor: o que aparece na página
 * pública de captação (título/subtítulo) e o convite pronto pra compartilhar.
 */
export interface LeadCampaign {
  titulo: string;
  subtitulo: string;
  descricao: string;
  beneficios: string[];
  convite: string;
}

/**
 * Um item dentro do Material de Vendas (armazenado no Storage, não no banco).
 * Pode ser uma pasta (isFolder) ou um arquivo.
 */
export interface StorageEntry {
  name: string;
  /** Caminho completo dentro do bucket (usado para abrir/excluir). */
  path: string;
  isFolder: boolean;
  size: number | null;
  updatedAt: string | null;
  mimeType: string | null;
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function err<T = never>(error: string): Result<T> {
  return { ok: false, error };
}
