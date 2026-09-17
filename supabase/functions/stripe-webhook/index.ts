import Stripe from 'https://esm.sh/stripe@17.3.1?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-11-20.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

const PRICE_START = Deno.env.get('STRIPE_PRICE_START') ?? '';
const PRICE_PRO = Deno.env.get('STRIPE_PRICE_PRO') ?? '';

const GB = 1024 * 1024 * 1024;
const PLAN_LIMITS: Record<string, number> = {
  start: 5 * GB,
  pro: 25 * GB,
};

/**
 * Preço do Stripe → plano.
 *
 * Configuração inválida deve falhar e permitir retry, nunca trocar direitos.
 */
export function tierForPrice(priceId: string | null | undefined): 'start' | 'pro' {
  if (!PRICE_START || !PRICE_PRO || PRICE_START === PRICE_PRO) throw new Error('Preços não configurados.');
  if (priceId === PRICE_PRO) return 'pro';
  if (priceId === PRICE_START) return 'start';
  throw new Error(`Preço não reconhecido: ${priceId ?? 'ausente'}`);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Método não permitido', { status: 405 });
  const signature = req.headers.get('stripe-signature');
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature ?? '', webhookSecret);
  } catch (e) {
    console.error('Assinatura inválida:', (e as Error).message);
    return new Response('Assinatura inválida', { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = await resolveSubscription(event);
        if (subscription) await upsertSubscription(subscription, event.created);
        break;
      }
      default:
        break;
    }
    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('Erro ao processar webhook:', e);
    return new Response('Erro interno', { status: 500 });
  }
});

async function resolveSubscription(event: Stripe.Event): Promise<Stripe.Subscription | null> {
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    if (!session.subscription) return null;
    return stripe.subscriptions.retrieve(session.subscription as string);
  }
  // Eventos podem chegar repetidos ou fora de ordem; consultar o estado atual
  // impede reativar a conta com o snapshot de uma notificação antiga.
  return stripe.subscriptions.retrieve((event.data.object as Stripe.Subscription).id);
}

async function upsertSubscription(sub: Stripe.Subscription, eventCreated: number): Promise<void> {
  const userId = sub.metadata?.supabase_user_id;
  if (!userId) {
    throw new Error(`Subscription sem supabase_user_id: ${sub.id}`);
  }

  const periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : null;

  const priceId = sub.items.data[0]?.price?.id ?? null;
  const tier = tierForPrice(priceId);
  const active = sub.status === 'active' || sub.status === 'trialing';
  const storageLimit = active ? PLAN_LIMITS[tier] : 0;

  // A RPC faz a ordenação atômica no banco, inclusive entre execuções paralelas.
  const { error } = await admin.rpc('sync_billing_subscription', {
    p_user_id: userId,
    p_status: sub.status,
    p_price_id: priceId,
    p_tier: tier,
    p_storage_limit: storageLimit,
    p_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    p_subscription_id: sub.id,
    p_period_end: periodEnd,
    p_cancel_at_period_end: sub.cancel_at_period_end ?? false,
    p_event_created: eventCreated,
  });
  if (error) throw error;
}
