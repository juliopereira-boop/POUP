import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

import { syncRevenueCatSubscriber } from '../_shared/revenuecat.ts';

interface RevenueCatWebhookBody {
  event?: {
    aliases?: unknown;
    app_user_id?: unknown;
    environment?: unknown;
    id?: unknown;
    original_app_user_id?: unknown;
    store?: unknown;
    event_timestamp_ms?: unknown;
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function userIdFromEvent(event: NonNullable<RevenueCatWebhookBody['event']>): string | null {
  const candidates = [event.app_user_id, event.original_app_user_id];
  if (Array.isArray(event.aliases)) candidates.push(...event.aliases);
  return candidates.find((value): value is string => typeof value === 'string' && UUID.test(value)) ?? null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const expected = Deno.env.get('REVENUECAT_WEBHOOK_AUTH_TOKEN') ?? '';
  const received = req.headers.get('Authorization') ?? '';
  if (!expected || received !== expected) return json({ error: 'Não autorizado.' }, 401);

  try {
    const body = await req.json() as RevenueCatWebhookBody;
    const event = body.event;
    if (!event || typeof event.id !== 'string' || event.id.length > 255) {
      return json({ error: 'Evento inválido.' }, 400);
    }

    const userId = userIdFromEvent(event);
    if (!userId) {
      // O botão de teste do RevenueCat usa IDs fictícios. Confirmamos o
      // recebimento sem criar dados para uma conta inexistente.
      console.warn('[revenuecat] Evento sem UUID do Supabase:', event.id);
      return json({ received: true, ignored: true }, 202);
    }

    const timestamp = typeof event.event_timestamp_ms === 'number'
      ? Math.trunc(event.event_timestamp_ms)
      : Date.now();
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // RevenueCat's dashboard test uses a syntactically valid, but fictitious,
    // UUID. A real event must point to an existing Supabase Auth user; otherwise
    // the subscription upsert would fail on its foreign key and make the health
    // check look like an integration failure.
    const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(userId);
    if (authUserError || !authUser.user) {
      console.warn('[revenuecat] Evento para usuário inexistente ignorado:', event.id);
      return json({ received: true, ignored: true }, 202);
    }

    await syncRevenueCatSubscriber(admin, userId, {
      eventId: event.id,
      eventTimestampMs: timestamp,
      environment: typeof event.environment === 'string' ? event.environment : null,
      store: typeof event.store === 'string' ? event.store : null,
    });
    return json({ received: true });
  } catch (error) {
    console.error('[revenuecat] Falha no webhook:', error);
    return json({ error: 'Falha temporária ao sincronizar.' }, 500);
  }
});
