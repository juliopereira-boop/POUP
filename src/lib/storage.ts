/**
 * ONDE O APP GUARDA COISAS NO APARELHO.
 *
 * ===========================================================================
 * DOIS COFRES, PORQUE SÃO DOIS TIPOS DE SEGREDO
 * ===========================================================================
 * `sessionStorage` é o armazenamento comum: rascunho, tema, consentimento,
 * miniatura. Fica no AsyncStorage, que no Android é um arquivo do app e no iOS
 * um plist — protegido do resto do sistema, mas legível por quem tenha acesso
 * ao backup do aparelho ou a um dispositivo com jailbreak.
 *
 * `tokenStorage` é para o **token de sessão** e só para ele. Um CRM com CPF,
 * renda e documento de cliente não pode deixar a credencial de acesso no mesmo
 * lugar que o tema escolhido: quem obtém esse token entra na conta inteira,
 * sem senha e sem segundo fator.
 *
 * Por isso o token vai para o **Keychain** (iOS) ou o **Keystore** (Android),
 * via `expo-secure-store` — o cofre do sistema operacional, protegido por
 * hardware, que não sai em backup comum. Foi um apontamento direto da
 * auditoria.
 *
 * ===========================================================================
 * O LIMITE DE 2048 BYTES, E POR QUE ELE NÃO É PROBLEMA AQUI
 * ===========================================================================
 * O `SecureStore` recusa valores acima de ~2 KB. A sessão do Supabase é um JSON
 * com dois JWTs e costuma ficar em 1,2–1,8 KB — cabe, mas não com folga
 * enorme, e um token maior num projeto futuro passaria do teto.
 *
 * Então há um plano B explícito: se não couber (ou se o cofre falhar), o valor
 * vai para o AsyncStorage e o app continua funcionando. Perder o cofre é ruim;
 * impedir o corretor de entrar é pior. O caminho de fallback registra no log
 * para não virar degradação silenciosa.
 *
 * ===========================================================================
 * NA WEB NÃO EXISTE KEYCHAIN
 * ===========================================================================
 * `expo-secure-store` não tem implementação para navegador. Lá o token
 * continua onde sempre esteve, e a proteção é a do próprio navegador (origem,
 * HTTPS, sandbox). Fingir que há cofre onde não há seria pior do que não ter.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

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

/** Teto do SecureStore, com margem. Acima disso ele lança em vez de truncar. */
const TETO_COFRE = 2000;

/**
 * O cofre do sistema. Usado SÓ para o token de sessão do Supabase.
 *
 * A interface é a mesma do `sessionStorage` de propósito: o supabase-js recebe
 * um objeto com `getItem`/`setItem`/`removeItem` e não precisa saber qual dos
 * dois está usando.
 */
export const tokenStorage = {
  async getItem(key: string): Promise<string | null> {
    if (isWeb) return sessionStorage.getItem(key);
    try {
      const doCofre = await SecureStore.getItemAsync(key);
      if (doCofre !== null) return doCofre;
    } catch (e) {
      console.warn('Cofre indisponível na leitura; tentando o armazenamento comum.', (e as Error).name);
    }
    /*
     * Duas razões para cair aqui: o valor não coube no cofre e foi para o
     * AsyncStorage, ou esta é a primeira abertura depois da atualização e a
     * sessão antiga ainda está no lugar antigo. Nos dois casos, ler de lá é o
     * certo — senão o corretor seria deslogado sem motivo ao atualizar o app.
     */
    return AsyncStorage.getItem(key);
  },

  async setItem(key: string, value: string): Promise<void> {
    if (isWeb) return sessionStorage.setItem(key, value);

    if (value.length <= TETO_COFRE) {
      try {
        await SecureStore.setItemAsync(key, value, {
          // Sem isto, o token sai no backup do iCloud e volta em outro
          // aparelho. Credencial não deve viajar em backup.
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
        // Guardado no cofre: apaga a cópia antiga do armazenamento comum, senão
        // ela fica para trás como um token válido esquecido.
        await AsyncStorage.removeItem(key).catch(() => undefined);
        return;
      } catch (e) {
        console.warn('Cofre indisponível na escrita; usando o armazenamento comum.', (e as Error).name);
      }
    } else {
      console.warn('Token maior que o teto do cofre; usando o armazenamento comum.');
    }

    await AsyncStorage.setItem(key, value);
  },

  async removeItem(key: string): Promise<void> {
    if (isWeb) return sessionStorage.removeItem(key);
    // Os DOIS lugares, sempre. Apagar só um deixaria uma sessão válida viva no
    // outro — exatamente o que o logout precisa impedir.
    await SecureStore.deleteItemAsync(key).catch(() => undefined);
    await AsyncStorage.removeItem(key).catch(() => undefined);
  },
};
