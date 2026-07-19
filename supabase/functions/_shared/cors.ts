// Cabeçalhos CORS compartilhados pelas Edge Functions.
// Ajuste `Access-Control-Allow-Origin` para seu domínio em produção.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
