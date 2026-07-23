// Edge Function PÚBLICA: devolve os textos da página de captação de um
// corretor (título/subtítulo gerados pela IA) + o nome do corretor, para a
// landing page pública app/captar/[brokerId].tsx exibir.
//
// Sem verificação de JWT (o visitante não está logado):
//   supabase functions deploy get-lead-page --no-verify-jwt
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const body = (await req.json().catch(() => ({}))) as { brokerId?: string };
  const brokerId = (body.brokerId ?? '').trim();
  if (!brokerId) return json({ error: 'brokerId ausente.' }, 400);

  const [{ data: profile }, { data: campaign }] = await Promise.all([
    admin.from('profiles').select('full_name, agency').eq('id', brokerId).maybeSingle(),
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
