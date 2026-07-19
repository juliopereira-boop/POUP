import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * Adaptador de armazenamento para a sessão do Supabase.
 *
 * - Nativo (iOS/Android): AsyncStorage (persistente).
 * - Web: localStorage via AsyncStorage web shim, com fallback em memória
 *   para ambientes SSR/estáticos onde `window` não existe.
 *
 * Mantido isolado para trocar por SecureStore/expo-secure-store facilmente
 * quando quisermos criptografar tokens em nativo.
 */

const memoryStore = new Map<string, string>();

const isWeb = Platform.OS === 'web';
const hasWindow = typeof window !== 'undefined';

export const sessionStorage = {
  async getItem(key: string): Promise<string | null> {
    if (isWeb && !hasWindow) return memoryStore.get(key) ?? null;
    return AsyncStorage.getItem(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (isWeb && !hasWindow) {
      memoryStore.set(key, value);
      return;
    }
    await AsyncStorage.setItem(key, value);
  },
  async removeItem(key: string): Promise<void> {
    if (isWeb && !hasWindow) {
      memoryStore.delete(key);
      return;
    }
    await AsyncStorage.removeItem(key);
  },
};
