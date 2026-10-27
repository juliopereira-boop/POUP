// =====================================================================
// uau-disponibilidade — PONTE PARA O APP 1.0.1 (build 9). NADA DO UAU.
//
// Deploy: arquivo único. **Verify JWT: LIGADO** (quem chama é o app).
//
// O UAU saiu do POUP em 27/10/2026: a disponibilidade vem do CV CRM de cada
// construtora. O app 1.0.1 ainda chama esta função antes de gerar a
// proposta ({ "acao": "conferir", "unitId" }). Ela responde com a cor que
// está no banco (a do CV, lida de minuto em minuto), com a sessão do próprio
// corretor: quem não lê a unidade não fica sabendo de nada.
//
// Não fala com o UAU nem com o CV, e não usa secret nenhum. Qualquer outra
// ação devolve 410. Sai quando ninguém mais usar a 1.0.1 (junto com as RPCs
// de compatibilidade de 20261027120000_limpar_uau_e_cvcrm_antigo.sql).
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Não autenticado.' }, 401);
    const usuario = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (corpo.acao !== 'conferir') {
      return json({ error: 'O UAU saiu do POUP. Atualize o aplicativo.' }, 410);
    }

    const { data } = await usuario
      .from('development_unit_disponibilidade')
      .select('situacao, status_descricao, mudou_em')
      .eq('unit_id', String(corpo.unitId ?? ''))
      .maybeSingle();
    return json({ ok: true, conferidoAgora: false, ...(data ?? { situacao: 'sem_vinculo' }) });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
