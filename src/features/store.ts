import { Platform } from 'react-native';

/**
 * O navegador vende pelo Stripe; iOS/Android vendem pela loja nativa via
 * RevenueCat. `EXPO_PUBLIC_STORE_BUILD` continua permitindo conferir, no
 * navegador, a experiência restrita do binário sem levar o Stripe para ela.
 */
function flagFromEnv(): boolean {
  const raw = process.env.EXPO_PUBLIC_STORE_BUILD;
  return raw === '1' || raw?.toLowerCase() === 'true';
}

export const isStoreBuild: boolean = Platform.OS !== 'web' || flagFromEnv();
export const usesNativeBilling: boolean = Platform.OS !== 'web';
export const canShowWebBilling: boolean = !isStoreBuild;
export const canShowBilling: boolean = usesNativeBilling || canShowWebBilling;

/** LIA por texto, sem acesso ao microfone, disponível no web e nos apps nativos. */
export const liaDisponivel = true;

/**
 * Decisão de produto: formulário de cadastro disponível na web. Não é uma
 * proibição universal da Apple a cadastros gratuitos. Login social ainda pode
 * criar uma identidade no Supabase; direitos são verificados no servidor.
 */
export const podeCriarConta: boolean = !isStoreBuild;
