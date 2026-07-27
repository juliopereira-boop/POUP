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
  source?: string;
}

const ALLOWED_SOURCES = new Set(['landing', 'whatsapp']);

const MAX_NAME = 200;
const MAX_EMAIL = 320;
const MAX_MESSAGE = 2000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.slice(0, max).trim();
}

function uuidOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return UUID_RE.test(t) ? t : null;
}

function onlyDigits(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.slice(0, 40).replace(/\D/g, '');
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

  if (!body || typeof body !== 'object') {
    return new Response(JSON.stringify({ error: 'JSON inválido.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const name = text(body.name, MAX_NAME + 1);
  const phoneDigits = onlyDigits(body.phone);
  const brokerUserId = uuidOrNull(body.brokerUserId);
  const email = text(body.email, MAX_EMAIL);
  const message = text(body.message, MAX_MESSAGE);

  if (!brokerUserId) {
    return new Response(JSON.stringify({ error: 'Link de captação inválido.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (email && !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
    return new Response(JSON.stringify({ error: 'E-mail inválido.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (!name || name.length > MAX_NAME) {
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
    email: email || null,
    message: message || null,
    source:
      typeof body.source === 'string' && ALLOWED_SOURCES.has(body.source) ? body.source : 'landing',
    company_id: uuidOrNull(body.companyId),
    development_id: uuidOrNull(body.developmentId),
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
