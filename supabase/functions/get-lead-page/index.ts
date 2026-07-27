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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const body = (await req.json().catch(() => ({}))) as { brokerId?: unknown };
  const raw = typeof body?.brokerId === 'string' ? body.brokerId.trim() : '';
  if (!UUID_RE.test(raw)) return json({ error: 'brokerId inválido.' }, 400);
  const brokerId = raw;

  const [{ data: profile }, { data: campaign }] = await Promise.all([
    admin.from('profiles').select('full_name, agency, phone').eq('id', brokerId).maybeSingle(),
    admin
      .from('lead_campaigns')
      .select('titulo, subtitulo, descricao, beneficios')
      .eq('user_id', brokerId)
      .maybeSingle(),
  ]);

  if (!profile) return json({ error: 'Corretor não encontrado.' }, 404);

  const beneficios = Array.isArray(campaign?.beneficios) ? campaign?.beneficios : [];

  return json({
    brokerName: profile.full_name ?? null,
    agency: profile.agency ?? null,
    brokerPhone: profile.phone ?? null,
    titulo: campaign?.titulo ?? null,
    subtitulo: campaign?.subtitulo ?? null,
    descricao: campaign?.descricao ?? null,
    beneficios,
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
