import { Platform } from 'react-native';

import { env } from './env';

/**
 * URL base do app usada em redirects (OAuth do Google, retorno do Stripe,
 * links de email).
 *
 * No WEB, detectamos automaticamente a origem real onde o app está rodando
 * (localhost, preview da Vercel, domínio de produção). Isso evita o erro
 * clássico de "voltou pro localhost" quando a env EXPO_PUBLIC_APP_URL não bate
 * com o ambiente. No nativo (iOS/Android), usamos o valor de env (deep link).
 */
export function getAppUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return env.appUrl;
}
