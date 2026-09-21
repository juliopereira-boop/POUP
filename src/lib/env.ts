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
  /** Chaves públicas do SDK. As chaves secretas do RevenueCat ficam só no Supabase. */
  revenueCatIosApiKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? '',
  revenueCatAndroidApiKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ?? '',
  appUrl: process.env.EXPO_PUBLIC_APP_URL ?? 'http://localhost:8081',
} as const;

export const isBackendConfigured =
  env.supabaseUrl !== PLACEHOLDER_URL && env.supabaseAnonKey !== PLACEHOLDER_KEY;
