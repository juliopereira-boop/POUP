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

    const { returnUrl } = await req.json();

    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!sub?.stripe_customer_id) {
      return json({ error: 'Nenhuma assinatura encontrada.' }, 404);
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: safeUrl(returnUrl),
    });

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
