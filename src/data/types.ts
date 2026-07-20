/**
 * Modelos de domínio do POUP — independentes de qualquer banco.
 *
 * A UI e a lógica de negócio usam SOMENTE estes tipos. Cada implementação de
 * repositório (Supabase hoje, outro banco amanhã) é responsável por mapear
 * suas linhas para estes modelos.
 */

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
  phone: string | null;
  avatarUrl: string | null;
  /** Registro CRECI do corretor. */
  creci: string | null;
  createdAt: string;
  updatedAt: string;
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
  /** Risco da poupança da construtora (parâmetro de cálculo). */
  risk: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Empreendimento, sempre associado a uma empresa. */
export interface Development {
  id: string;
  companyId: string;
  name: string;
  /** Nome da empresa (preenchido em consultas com join), quando disponível. */
  companyName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function err<T = never>(error: string): Result<T> {
  return { ok: false, error };
}
