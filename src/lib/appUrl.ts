import { Platform } from 'react-native';

import { env } from './env';

export function getAppUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return env.appUrl;
}
