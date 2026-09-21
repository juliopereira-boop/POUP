import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const REVENUECAT_API = 'https://api.revenuecat.com/v1';
const GB = 1024 * 1024 * 1024;

const PRODUCTS = {
  'br.com.poup.app.start.monthly': { entitlement: 'poup_start', tier: 'start', limit: 5 * GB },
  'br.com.poup.app.pro.monthly': { entitlement: 'poup_pro', tier: 'pro', limit: 25 * GB },
} as const;

type PlanTier = 'start' | 'pro';

interface RevenueCatEntitlement {
  expires_date?: string | null;
  product_identifier?: string | null;
  purchase_date?: string | null;
}

interface RevenueCatSubscription {
  billing_issues_detected_at?: string | null;
  expires_date?: string | null;
  grace_period_expires_date?: string | null;
  is_sandbox?: boolean | null;
  purchase_date?: string | null;
  store?: string | null;
  unsubscribe_detected_at?: string | null;
}

interface RevenueCatSubscriber {
  entitlements?: Record<string, RevenueCatEntitlement>;
  original_app_user_id?: string | null;
  subscriptions?: Record<string, RevenueCatSubscription>;
}

interface RevenueCatResponse {
  subscriber?: RevenueCatSubscriber;
}

export interface RevenueCatEventContext {
  eventId: string;
  eventTimestampMs: number;
  environment?: string | null;
  store?: string | null;
}

interface SubscriptionSnapshot {
  status: 'active' | 'past_due' | 'canceled' | 'none';
  productId: string | null;
  tier: PlanTier | null;
  storageLimit: number;
  originalAppUserId: string | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  store: string | null;
  environment: string | null;
}

function validDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isEntitlementActive(
  entitlement: RevenueCatEntitlement,
  subscription: RevenueCatSubscription | undefined,
  now: number,
): boolean {
  const expiresAt = validDate(subscription?.expires_date ?? entitlement.expires_date);
  const graceEndsAt = validDate(subscription?.grace_period_expires_date);
  return expiresAt === null || expiresAt > now || (graceEndsAt !== null && graceEndsAt > now);
}

function snapshotFor(subscriber: RevenueCatSubscriber): SubscriptionSnapshot {
  const now = Date.now();
  const entitlements = subscriber.entitlements ?? {};
  const subscriptions = subscriber.subscriptions ?? {};

  // O plano mais completo prevalece se, por qualquer atraso da loja, os dois
  // entitlements aparecerem ativos ao mesmo tempo.
  for (const tier of ['pro', 'start'] as const) {
    const product = Object.entries(PRODUCTS).find(([, value]) => value.tier === tier);
    if (!product) continue;
    const [productId, config] = product;
    const entitlement = entitlements[config.entitlement];
    const subscription = subscriptions[productId];
    if (!entitlement || !isEntitlementActive(entitlement, subscription, now)) continue;

    if (entitlement.product_identifier && entitlement.product_identifier !== productId) {
      throw new Error(`Produto inesperado no entitlement ${config.entitlement}.`);
    }

    return {
      status: 'active',
      productId,
      tier: config.tier,
      storageLimit: config.limit,
      originalAppUserId: subscriber.original_app_user_id ?? null,
      periodEnd: subscription?.expires_date ?? entitlement.expires_date ??
        subscription?.grace_period_expires_date ?? null,
      cancelAtPeriodEnd: Boolean(subscription?.unsubscribe_detected_at),
      store: subscription?.store ?? null,
      environment: subscription?.is_sandbox === true
        ? 'SANDBOX'
        : subscription?.is_sandbox === false ? 'PRODUCTION' : null,
    };
  }

  const known = Object.entries(PRODUCTS)
    .map(([productId, config]) => ({ productId, config, entitlement: entitlements[config.entitlement] }))
    .filter((item) => item.entitlement)
    .sort((a, b) => (validDate(b.entitlement?.purchase_date) ?? 0) - (validDate(a.entitlement?.purchase_date) ?? 0))[0];

  if (!known?.entitlement) {
    return {
      status: 'none',
      productId: null,
      tier: null,
      storageLimit: 0,
      originalAppUserId: subscriber.original_app_user_id ?? null,
      periodEnd: null,
      cancelAtPeriodEnd: false,
      store: null,
      environment: null,
    };
  }

  const subscription = subscriptions[known.productId];
  return {
    status: subscription?.billing_issues_detected_at ? 'past_due' : 'canceled',
    productId: known.productId,
    tier: known.config.tier,
    storageLimit: 0,
    originalAppUserId: subscriber.original_app_user_id ?? null,
    periodEnd: subscription?.expires_date ?? known.entitlement.expires_date ?? null,
    cancelAtPeriodEnd: Boolean(subscription?.unsubscribe_detected_at),
    store: subscription?.store ?? null,
    environment: subscription?.is_sandbox === true
      ? 'SANDBOX'
      : subscription?.is_sandbox === false ? 'PRODUCTION' : null,
  };
}

export async function syncRevenueCatSubscriber(
  admin: SupabaseClient,
  userId: string,
  context: RevenueCatEventContext,
): Promise<SubscriptionSnapshot> {
  const secret = Deno.env.get('REVENUECAT_SECRET_API_KEY') ?? '';
  if (!secret) throw new Error('REVENUECAT_SECRET_API_KEY não configurada.');

  const response = await fetch(
    `${REVENUECAT_API}/subscribers/${encodeURIComponent(userId)}`,
    { headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json' } },
  );
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`RevenueCat respondeu ${response.status}: ${detail}`);
  }

  const body = await response.json() as RevenueCatResponse;
  if (!body.subscriber) throw new Error('RevenueCat não retornou o assinante.');
  const snapshot = snapshotFor(body.subscriber);

  const { error } = await admin.rpc('sync_revenuecat_subscription', {
    p_user_id: userId,
    p_status: snapshot.status,
    p_product_id: snapshot.productId,
    p_tier: snapshot.tier,
    p_storage_limit: snapshot.storageLimit,
    p_original_app_user_id: snapshot.originalAppUserId,
    p_period_end: snapshot.periodEnd,
    p_cancel_at_period_end: snapshot.cancelAtPeriodEnd,
    p_store: context.store ?? snapshot.store,
    p_environment: context.environment ?? snapshot.environment,
    p_event_id: context.eventId,
    p_event_timestamp_ms: context.eventTimestampMs,
  });
  if (error) throw error;
  return snapshot;
}
