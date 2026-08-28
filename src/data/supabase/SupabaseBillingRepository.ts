/**
 * SÓ LEITURA — o caminho de compra não mora mais aqui.
 *
 * `createCheckoutSession` e `createBillingPortalSession` saíram deste arquivo
 * para `src/features/cobranca/`, que o Metro resolve por plataforma. Este
 * repositório é o mesmo nas duas, então tudo que ele carrega vai junto para o
 * binário das lojas — e era assim que os endereços do Stripe entravam no IPA
 * mesmo com a interface de cobrança escondida.
 *
 * O porquê completo está em `src/features/cobranca/abrirCobranca.native.ts`.
 */
import { supabase } from '@/lib/supabase';
import type { BillingRepository } from '../repositories';
import {
  type PlanTier,
  type Subscription,
  type SubscriptionStatus,
} from '../types';
import type { Database } from '../database.types';

type SubscriptionRow = Database['public']['Tables']['subscriptions']['Row'];

function mapStatus(raw: string): SubscriptionStatus {
  const known: SubscriptionStatus[] = [
    'active',
    'trialing',
    'past_due',
    'canceled',
    'incomplete',
    'none',
  ];
  return (known as string[]).includes(raw) ? (raw as SubscriptionStatus) : 'none';
}

function mapTier(raw: string | null): PlanTier | null {
  return raw === 'start' || raw === 'pro' ? raw : null;
}

function mapSubscription(row: SubscriptionRow): Subscription {
  return {
    status: mapStatus(row.status),
    tier: mapTier(row.plan_tier),
    plan: row.plan,
    storageLimitBytes: Number(row.storage_limit_bytes ?? 0),
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    trialStartedAt: row.trial_started_at ?? null,
  };
}

export class SupabaseBillingRepository implements BillingRepository {
  async getSubscription(userId: string): Promise<Subscription | null> {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return null;
    return mapSubscription(data);
  }

  async getStorageUsedBytes(userId: string): Promise<number> {
    const { data, error } = await supabase.rpc('user_storage_used', { uid: userId });
    if (error || data == null) return 0;
    return Number(data);
  }
}
