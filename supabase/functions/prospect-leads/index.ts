/** Recurso descontinuado. Mantém 410 para clientes antigos, sem consultar terceiros. */
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
Deno.serve((req) => req.method === 'OPTIONS'
  ? new Response('ok', { headers })
  : new Response(JSON.stringify({ error: 'Prospecção por dados públicos descontinuada.' }), {
    status: 410, headers,
  }));
