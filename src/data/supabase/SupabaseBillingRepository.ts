import { supabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import type { BillingRepository } from '../repositories';
import {
  type PlanTier,
  type Result,
  type Subscription,
  type SubscriptionStatus,
  err,
  ok,
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

  /** Bytes usados no Storage pelo usuário (via função SQL user_storage_used). */
  async getStorageUsedBytes(userId: string): Promise<number> {
    const { data, error } = await supabase.rpc('user_storage_used', { uid: userId });
    if (error || data == null) return 0;
    return Number(data);
  }

  /**
   * Chama a Edge Function `create-checkout-session`, que fala com o Stripe
   * usando segredos que só existem no servidor. O client nunca vê a secret key.
   */
  async createCheckoutSession(priceId: string): Promise<Result<{ url: string }>> {
    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      body: {
        priceId,
        successUrl: `${env.appUrl}/?checkout=success`,
        cancelUrl: `${env.appUrl}/paywall?checkout=cancel`,
      },
    });
    if (error) return err(error.message);
    const url = (data as { url?: string })?.url;
    if (!url) return err('Não foi possível iniciar o pagamento.');
    return ok({ url });
  }

  async createBillingPortalSession(): Promise<Result<{ url: string }>> {
    const { data, error } = await supabase.functions.invoke('create-billing-portal-session', {
      body: { returnUrl: `${env.appUrl}/configuracoes` },
    });
    if (error) return err(error.message);
    const url = (data as { url?: string })?.url;
    if (!url) return err('Não foi possível abrir o portal de assinatura.');
    return ok({ url });
  }
}
