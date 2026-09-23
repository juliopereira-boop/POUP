import Stripe from 'https://esm.sh/stripe@17.3.1?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-11-20.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

const PRICE_START = Deno.env.get('STRIPE_PRICE_START') ?? '';
const PRICE_PRO = Deno.env.get('STRIPE_PRICE_PRO') ?? '';

const PRICE_BY_PLAN = {
  start: PRICE_START,
  pro: PRICE_PRO,
} as const;

const EXPECTED_AMOUNT_BY_PLAN = {
  start: 2990,
  pro: 5990,
} as const;

export function configuredPrices(): boolean {
  return /^price_\w+$/.test(PRICE_START) && /^price_\w+$/.test(PRICE_PRO) && PRICE_START !== PRICE_PRO;
}

function safeUrl(v: unknown): string | undefined {
  if (typeof v !== 'string' || v.length > 2000) return undefined;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:' ? v : undefined;
  } catch {
    return undefined;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  if (!configuredPrices()) return json({ error: 'Planos temporariamente indisponíveis.' }, 503);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Não autenticado.' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Não autenticado.' }, 401);

    const { plan, successUrl, cancelUrl } = await req.json();

if (plan !== 'start' && plan !== 'pro') {
  return json({ error: 'Plano inválido.' }, 400);
}

const priceId = PRICE_BY_PLAN[plan];

if (!priceId) {
  return json({ error: 'Plano temporariamente indisponível.' }, 503);
}

    // Impede exibir R$ 59,90 enquanto um secret ainda aponta para outro valor.
    const price = await stripe.prices.retrieve(priceId);
    const expectedAmount = EXPECTED_AMOUNT_BY_PLAN[plan];
    if (!price.active || price.currency !== 'brl' || price.unit_amount !== expectedAmount ||
        price.recurring?.interval !== 'month' || price.recurring.interval_count !== 1) {
      console.error('Preço configurado não corresponde à oferta:', priceId);
      return json({ error: 'Este plano está temporariamente indisponível. Fale com o suporte.' }, 503);
    }

    const { data: existing, error: existingError } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id, stripe_subscription_id, billing_provider, status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.billing_provider === 'revenuecat' && existing.status === 'active') {
      return json({ error: 'Você já possui uma assinatura pela loja do celular. Gerencie-a pela App Store ou Google Play.' }, 409);
    }
    if (existing?.stripe_subscription_id) {
      const current = await stripe.subscriptions.retrieve(existing.stripe_subscription_id);
      if (current.status !== 'canceled' && current.status !== 'incomplete_expired') {
        return json({ error: 'Você já possui uma assinatura. Use Gerenciar assinatura para alterá-la.' }, 409);
      }
    }

    let customerId = existing?.stripe_customer_id ?? undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      }, { idempotencyKey: `poup-customer-${user.id}` });
      const admin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        { auth: { autoRefreshToken: false, persistSession: false } },
      );
      const { data: assignedCustomer, error: assignmentError } = await admin.rpc('assign_billing_customer', {
        p_user_id: user.id,
        p_customer_id: customer.id,
      });
      if (assignmentError || typeof assignedCustomer !== 'string') {
        throw assignmentError ?? new Error('Não foi possível vincular o cliente de cobrança.');
      }
      customerId = assignedCustomer;
    }

    // O webhook pode estar atrasado: confira também a origem da cobrança.
    const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
    if (subscriptions.has_more || subscriptions.data.some((s) => s.status !== 'canceled' && s.status !== 'incomplete_expired')) {
      return json({ error: 'Você já possui uma assinatura. Use Gerenciar assinatura para alterá-la.' }, 409);
    }
    const openSessions = await stripe.checkout.sessions.list({ customer: customerId, status: 'open', limit: 1 });
    if (openSessions.data.length > 0) {
      const open = openSessions.data[0];
      if (open.metadata?.price_id === priceId && open.url) return json({ url: open.url });
      return json({ error: 'Já existe um pagamento em andamento. Conclua ou aguarde sua expiração antes de trocar o plano.' }, 409);
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: safeUrl(successUrl),
      cancel_url: safeUrl(cancelUrl),
      allow_promotion_codes: true,
      subscription_data: { metadata: { supabase_user_id: user.id } },
      metadata: { supabase_user_id: user.id, price_id: priceId },
    }, {
  idempotencyKey: `poup-checkout-${user.id}-${plan}-${Math.floor(Date.now() / 1_800_000)}`,
});

    return json({ url: session.url });
  } catch (e) {
    console.error('Falha ao criar checkout:', (e as Error).name);
    return json({ error: 'Não foi possível iniciar o pagamento. Tente novamente.' }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
