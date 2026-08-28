import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

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
