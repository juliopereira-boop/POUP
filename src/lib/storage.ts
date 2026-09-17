import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { createSecureTokenStorage } from './secureTokenStorage';

const memoryStore = new Map<string, string>();
const isWeb = Platform.OS === 'web';
const hasWindow = typeof window !== 'undefined';

/** Armazenamento comum: rascunhos, preferências, consentimentos. */
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

/** Web usa a proteção da origem. Nativo usa exclusivamente Keychain/Keystore. */
export const tokenStorage = isWeb ? sessionStorage : createSecureTokenStorage({
  getItem: SecureStore.getItemAsync,
  setItem: (key, value) => SecureStore.setItemAsync(key, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  }),
  removeItem: SecureStore.deleteItemAsync,
}, AsyncStorage, Crypto.randomUUID);
