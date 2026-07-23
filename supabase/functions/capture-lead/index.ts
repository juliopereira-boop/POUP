// Edge Function: recebe submissões da LANDING PAGE PÚBLICA de captação de
// leads (app/captar/[brokerId].tsx) e insere em `public.leads`.
//
// Pública e SEM verificação de JWT (o visitante não está logado):
//   supabase functions deploy capture-lead --no-verify-jwt
//
// Segredos necessários (já injetados pelo Supabase): SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

interface Payload {
  brokerUserId?: string;
  name?: string;
  phone?: string;
  email?: string;
  message?: string;
  companyId?: string;
  developmentId?: string;
}

function onlyDigits(v: string): string {
  return v.replace(/\D/g, '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const name = (body.name ?? '').trim();
  const phoneDigits = onlyDigits(body.phone ?? '');
  const brokerUserId = (body.brokerUserId ?? '').trim();

  // Validação mínima — não travamos em regras rígidas demais, mas exigimos
  // o essencial pra um lead ser útil e identificável.
  if (!brokerUserId) {
    return new Response(JSON.stringify({ error: 'Link de captação inválido.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (!name || name.length > 200) {
    return new Response(JSON.stringify({ error: 'Informe seu nome.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (phoneDigits.length < 10 || phoneDigits.length > 11) {
    return new Response(JSON.stringify({ error: 'Informe um telefone válido (com DDD).' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Confirma que o link aponta pra um corretor de verdade (evita popular
  // leads "órfãos" com um brokerUserId inventado).
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('id', brokerUserId)
    .maybeSingle();
  if (!profile) {
    return new Response(JSON.stringify({ error: 'Link de captação inválido.' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { error } = await admin.from('leads').insert({
    user_id: brokerUserId,
    name,
    phone: phoneDigits,
    email: body.email?.trim() || null,
    message: body.message?.trim() || null,
    source: 'landing',
    company_id: body.companyId || null,
    development_id: body.developmentId || null,
  });
  if (error) {
    console.error('Erro ao inserir lead:', error.message);
    return new Response(JSON.stringify({ error: 'Não foi possível enviar. Tente novamente.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
