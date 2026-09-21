import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

import { syncRevenueCatSubscriber } from '../_shared/revenuecat.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Não autenticado.' }, 401);

    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: authError } = await anon.auth.getUser();
    if (authError || !user) return json({ error: 'Não autenticado.' }, 401);

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const timestamp = Date.now();
    const snapshot = await syncRevenueCatSubscriber(admin, user.id, {
      eventId: `app-sync-${user.id}-${timestamp}`,
      eventTimestampMs: timestamp,
    });
    return json({ subscription: snapshot });
  } catch (error) {
    console.error('[revenuecat] Falha na sincronização solicitada pelo app:', error);
    return json({ error: 'Não foi possível confirmar a assinatura agora.' }, 503);
  }
});
