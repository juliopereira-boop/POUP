import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { env } from './env';
import { sessionStorage } from './storage';
import type { Database } from '@/data/database.types';

/**
 * Cliente Supabase único do app.
 *
 * IMPORTANTE: a UI NÃO deve importar este cliente diretamente. Ela conversa
 * apenas com a camada de repositórios (src/data). Assim, quando trocarmos o
 * Supabase por um banco mais robusto, mexemos só nas implementações de
 * repositório — a UI permanece intacta.
 */
export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage: sessionStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Em web, o Supabase detecta o token na URL (fluxo OAuth via redirect).
    detectSessionInUrl: Platform.OS === 'web',
  },
});
