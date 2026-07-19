/**
 * Ponto único de composição da camada de dados.
 *
 * A UI importa `db` daqui e usa `db.auth`, `db.profiles`, `db.billing`.
 * Para migrar de banco no futuro (ex.: um Postgres próprio, Prisma, outra API),
 * basta criar novas implementações das interfaces em ./repositories.ts e
 * trocá-las aqui. Nenhuma tela precisa mudar.
 */
import type { AuthRepository, BillingRepository, ProfileRepository } from './repositories';
import { SupabaseAuthRepository } from './supabase/SupabaseAuthRepository';
import { SupabaseProfileRepository } from './supabase/SupabaseProfileRepository';
import { SupabaseBillingRepository } from './supabase/SupabaseBillingRepository';

export interface DataLayer {
  auth: AuthRepository;
  profiles: ProfileRepository;
  billing: BillingRepository;
}

/**
 * Provedor ativo. Hoje: 'supabase'.
 * Amanhã, adicione um case aqui (ex.: 'api', 'prisma') e retorne a
 * implementação correspondente.
 */
type Provider = 'supabase';
const ACTIVE_PROVIDER: Provider = 'supabase';

function createDataLayer(provider: Provider): DataLayer {
  switch (provider) {
    case 'supabase':
    default:
      return {
        auth: new SupabaseAuthRepository(),
        profiles: new SupabaseProfileRepository(),
        billing: new SupabaseBillingRepository(),
      };
  }
}

export const db: DataLayer = createDataLayer(ACTIVE_PROVIDER);

export * from './types';
export type { AuthRepository, BillingRepository, ProfileRepository } from './repositories';
