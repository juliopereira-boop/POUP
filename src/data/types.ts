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

export interface Subscription {
  status: SubscriptionStatus;
  plan: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

/** Assinatura considerada válida para liberar o acesso ao app. */
export function isSubscriptionActive(sub: Subscription | null): boolean {
  if (!sub) return false;
  return sub.status === 'active' || sub.status === 'trialing';
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function err<T = never>(error: string): Result<T> {
  return { ok: false, error };
}
