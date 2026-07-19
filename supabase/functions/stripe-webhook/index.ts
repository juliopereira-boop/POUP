// Edge Function: recebe webhooks do Stripe e sincroniza a tabela `subscriptions`.
// Esta tabela é a FONTE DA VERDADE do acesso ao app (o client só lê dela).
//
// Segredos necessários:
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET     whsec_... (do endpoint criado no Stripe Dashboard)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (injetados)
//
// IMPORTANTE: configure este endpoint SEM verificação de JWT:
//   supabase functions deploy stripe-webhook --no-verify-jwt
// (o Stripe não envia JWT; a autenticidade vem da assinatura do webhook.)

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

// Mapeamento price -> plano. Os price IDs vêm dos mesmos segredos usados no
// client; defina no Supabase: supabase secrets set STRIPE_PRICE_START=price_...
const PRICE_START = Deno.env.get('STRIPE_PRICE_START') ?? '';
const PRICE_PRO = Deno.env.get('STRIPE_PRICE_PRO') ?? '';

const GB = 1024 * 1024 * 1024;
// ⚠️ Mantenha em sincronia com src/features/plans.ts (storageLimitBytes).
const PLAN_LIMITS: Record<string, number> = {
  start: 1 * GB,
  pro: 25 * GB,
};

function tierForPrice(priceId: string | null | undefined): 'start' | 'pro' {
  if (priceId && priceId === PRICE_PRO) return 'pro';
  return 'start'; // padrão seguro
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
        // Ignoramos os demais eventos.
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
  // Se a assinatura não está ativa, zera o limite (bloqueia novos uploads).
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
