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
const PRICE_INTERMED = Deno.env.get('STRIPE_PRICE_INTERMED') ?? '';
const PRICE_PRO = Deno.env.get('STRIPE_PRICE_PRO') ?? '';

const GB = 1024 * 1024 * 1024;
const PLAN_LIMITS: Record<string, number> = {
  start: 5 * GB,
  intermed: 15 * GB,
  pro: 25 * GB,
};

/**
 * Preço do Stripe → plano.
 *
 * O fallback é `start` de propósito, e a escolha importa: se um preço novo for
 * criado no Stripe e alguém esquecer de configurar a variável aqui, o assinante
 * cai no plano MAIS BARATO. Errar para baixo gera um chamado de suporte; errar
 * para cima entrega de graça o que ele deveria pagar, e ninguém reclama de
 * ganhar recurso — o erro passaria despercebido.
 */
function tierForPrice(priceId: string | null | undefined): 'start' | 'intermed' | 'pro' {
  if (!priceId) return 'start';
  if (priceId === PRICE_PRO) return 'pro';
  if (priceId === PRICE_INTERMED) return 'intermed';
  return 'start';
}

Deno.serve(async (req) => {
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
        if (subscription) await upsertSubscription(subscription);
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
  return event.data.object as Stripe.Subscription;
}

async function upsertSubscription(sub: Stripe.Subscription): Promise<void> {
  const userId = sub.metadata?.supabase_user_id;
  if (!userId) {
    console.warn('subscription sem supabase_user_id nos metadados:', sub.id);
    return;
  }

  const periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : null;

  const priceId = sub.items.data[0]?.price?.id ?? null;
  const tier = tierForPrice(priceId);
  const active = sub.status === 'active' || sub.status === 'trialing';
  const storageLimit = active ? PLAN_LIMITS[tier] : 0;

  const { error } = await admin.from('subscriptions').upsert(
    {
      user_id: userId,
      status: sub.status,
      plan: priceId,
      plan_tier: tier,
      storage_limit_bytes: storageLimit,
      stripe_customer_id: sub.customer as string,
      stripe_subscription_id: sub.id,
      current_period_end: periodEnd,
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  if (error) console.error('Erro no upsert de subscription:', error);
}
