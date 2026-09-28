import Stripe from 'https://esm.sh/stripe@17.3.1?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/*
 * `acao` (opcional), vinda da tela Planos:
 *   - 'trocar' + `plano`: abre o portal JÁ na confirmação da troca de plano
 *     (Stripe mostra o valor novo e a diferença antes do corretor confirmar);
 *   - 'cancelar': abre o portal JÁ na confirmação do cancelamento.
 * Sem `acao`, o portal de sempre. Se o Stripe recusar o atalho (portal sem a
 * troca de plano habilitada, assinatura antiga), cai no portal de sempre —
 * o corretor nunca fica sem caminho.
 */
const PRICE_BY_PLAN: Record<string, string> = {
  start: Deno.env.get('STRIPE_PRICE_START') ?? '',
  pro: Deno.env.get('STRIPE_PRICE_PRO') ?? '',
};

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-11-20.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Não autenticado.' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Não autenticado.' }, 401);

    const { returnUrl, acao, plano } = await req.json();

    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id, stripe_subscription_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!sub?.stripe_customer_id) {
      return json({ error: 'Nenhuma assinatura encontrada.' }, 404);
    }

    const volta = safeUrl(returnUrl);
    const base = { customer: sub.stripe_customer_id, return_url: volta };
    let flow: Record<string, unknown> | null = null;

    if ((acao === 'trocar' || acao === 'cancelar') && sub.stripe_subscription_id) {
      if (acao === 'cancelar') {
        flow = { type: 'subscription_cancel', subscription_cancel: { subscription: sub.stripe_subscription_id } };
      } else {
        const preco = typeof plano === 'string' ? PRICE_BY_PLAN[plano] : '';
        if (!preco || !/^price_\w+$/.test(preco)) return json({ error: 'Plano inválido.' }, 400);
        const assinatura = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
        const item = assinatura.items?.data?.[0];
        if (!item?.id) return json({ error: 'Nenhuma assinatura encontrada.' }, 404);
        if (item.price?.id === preco) return json({ error: 'Você já está neste plano.' }, 409);
        flow = {
          type: 'subscription_update_confirm',
          subscription_update_confirm: {
            subscription: sub.stripe_subscription_id,
            items: [{ id: item.id, price: preco, quantity: 1 }],
          },
        };
      }
      if (volta) flow.after_completion = { type: 'redirect', redirect: { return_url: volta } };
    }

    let session;
    try {
      session = await stripe.billingPortal.sessions.create(flow ? { ...base, flow_data: flow } : base);
    } catch (e) {
      if (!flow) throw e;
      console.error('Portal: atalho recusado, abrindo o portal de sempre:', (e as Error).name);
      session = await stripe.billingPortal.sessions.create(base);
    }

    return json({ url: session.url });
  } catch (e) {
    console.error('Falha ao abrir portal de cobrança:', (e as Error).name);
    return json({ error: 'Não foi possível abrir o portal de cobrança. Tente novamente.' }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
