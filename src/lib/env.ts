/**
 * Acesso centralizado e tipado às variáveis de ambiente públicas.
 *
 * Somente variáveis com prefixo EXPO_PUBLIC_ são embutidas no bundle do client.
 * Segredos (service role, Stripe secret, webhook secret) vivem apenas nas
 * Edge Functions do Supabase — nunca aqui.
 */

// Placeholders para o cliente conseguir ser construído durante o build/prerender
// mesmo sem .env configurado. Em runtime, chamadas falham de forma controlada
// (a UI mostra o estado de "backend não configurado").
const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_KEY = 'placeholder-anon-key';

function readPublic(name: string, value: string | undefined, fallback: string): string {
  if (!value || value.length === 0) {
    console.warn(
      `[env] Variável ${name} ausente. Configure seu arquivo .env (veja .env.example).`,
    );
    return fallback;
  }
  return value;
}

export const env = {
  supabaseUrl: readPublic(
    'EXPO_PUBLIC_SUPABASE_URL',
    process.env.EXPO_PUBLIC_SUPABASE_URL,
    PLACEHOLDER_URL,
  ),
  supabaseAnonKey: readPublic(
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    PLACEHOLDER_KEY,
  ),
  stripePublishableKey: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
  // Price IDs por plano (Stripe). Cada plano é um preço mensal recorrente.
  stripePriceStart: process.env.EXPO_PUBLIC_STRIPE_PRICE_START ?? '',
  stripePricePro: process.env.EXPO_PUBLIC_STRIPE_PRICE_PRO ?? '',
  appUrl: process.env.EXPO_PUBLIC_APP_URL ?? 'http://localhost:8081',
} as const;

/** Indica se o backend (Supabase) está configurado (não é placeholder). */
export const isBackendConfigured =
  env.supabaseUrl !== PLACEHOLDER_URL && env.supabaseAnonKey !== PLACEHOLDER_KEY;
