import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { env } from './env';
import { tokenStorage } from './storage';
import type { Database } from '@/data/database.types';

export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    /*
     * O token vai para o cofre do sistema (Keychain/Keystore), não para o
     * AsyncStorage. Quem obtém este valor entra na conta inteira sem senha —
     * ver `tokenStorage` em `storage.ts`.
     */
    storage: tokenStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

/*
 * No celular, o temporizador que renova o login para quando o app vai para o
 * segundo plano — e o canal de tempo real (disponibilidade do UAU) para de
 * receber eventos, sem erro visível, quando o login vence com o app aberto. O
 * Supabase recomenda ligar e desligar a renovação com o AppState. No
 * navegador, a própria aba cuida disso.
 */
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (estado) => {
    if (estado === 'active') void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}
