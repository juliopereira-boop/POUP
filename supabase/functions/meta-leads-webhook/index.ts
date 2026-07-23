// Edge Function: recebe leads do META LEAD ADS (Facebook/Instagram) via
// webhook e insere em `public.leads` (source = 'meta').
//
// PRÉ-REQUISITO (feito fora do POUP, no painel do Meta): o corretor precisa
// ter um App no Meta for Developers com a permissão `leads_retrieval`
// aprovada pelo Meta (App Review), vinculado à Página do Facebook/anúncios.
// Só depois disso ele configura, no App do Meta, a URL deste webhook + o
// "verify token" gerado na tela de Prospecção do POUP.
//
// Pública e SEM verificação de JWT (o Meta não envia JWT do Supabase):
//   supabase functions deploy meta-leads-webhook --no-verify-jwt
//
// Segredos necessários (já injetados pelo Supabase): SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

interface MetaLeadChange {
  field: string;
  value: {
    leadgen_id?: string;
    page_id?: string;
    form_id?: string;
    ad_id?: string;
  };
}
interface MetaWebhookBody {
  entry?: { id: string; changes?: MetaLeadChange[] }[];
}
interface MetaFieldDatum {
  name: string;
  values: string[];
}

/** Busca os dados do lead no Graph API do Meta usando o token da página. */
async function fetchLeadFromMeta(
  leadgenId: string,
  pageAccessToken: string,
): Promise<Record<string, string> | null> {
  const url = `https://graph.facebook.com/v19.0/${leadgenId}?access_token=${encodeURIComponent(pageAccessToken)}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error('Falha ao buscar lead no Meta:', res.status, await res.text());
    return null;
  }
  const data = (await res.json()) as { field_data?: MetaFieldDatum[] };
  const out: Record<string, string> = {};
  for (const f of data.field_data ?? []) {
    out[f.name] = f.values?.[0] ?? '';
  }
  return out;
}

/** Nomes de campo mais comuns nos formulários padrão do Meta Lead Ads. */
function pick(fields: Record<string, string>, keys: string[]): string {
  for (const k of keys) {
    if (fields[k]) return fields[k];
  }
  return '';
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // --- Handshake de verificação do webhook (GET) ---
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode !== 'subscribe' || !token) {
      return new Response('Bad request', { status: 400 });
    }
    const { data } = await admin
      .from('meta_lead_integrations')
      .select('user_id')
      .eq('verify_token', token)
      .maybeSingle();
    if (!data) return new Response('Verify token inválido', { status: 403 });
    return new Response(challenge ?? '', { status: 200 });
  }

  // --- Evento de lead novo (POST) ---
  if (req.method === 'POST') {
    let body: MetaWebhookBody;
    try {
      body = await req.json();
    } catch {
      return new Response('JSON inválido', { status: 400 });
    }

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'leadgen') continue;
        const pageId = change.value.page_id ?? entry.id;
        const leadgenId = change.value.leadgen_id;
        if (!pageId || !leadgenId) continue;

        const { data: integration } = await admin
          .from('meta_lead_integrations')
          .select('user_id, page_access_token, company_id, development_id')
          .eq('page_id', pageId)
          .maybeSingle();
        if (!integration) {
          console.warn('Nenhuma integração encontrada para page_id', pageId);
          continue;
        }

        const fields = await fetchLeadFromMeta(leadgenId, integration.page_access_token);
        if (!fields) continue;

        const name = pick(fields, ['full_name', 'nome_completo', 'first_name']);
        const phone = pick(fields, ['phone_number', 'telefone']).replace(/\D/g, '');
        const email = pick(fields, ['email']);
        if (!phone) continue; // sem telefone, o lead não é útil pro corretor

        await admin.from('leads').insert({
          user_id: integration.user_id,
          name: name || 'Lead do Facebook/Instagram',
          phone,
          email: email || null,
          source: 'meta',
          company_id: integration.company_id,
          development_id: integration.development_id,
        });
      }
    }
    return new Response('ok', { status: 200 });
  }

  return new Response('Method not allowed', { status: 405 });
});
