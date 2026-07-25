import type {
  AuthRepository,
  BillingRepository,
  CompanyRepository,
  DevelopmentRepository,
  LeadRepository,
  MaterialRepository,
  ProfileRepository,
  SimulationRepository,
} from './repositories';
import { SupabaseAuthRepository } from './supabase/SupabaseAuthRepository';
import { SupabaseProfileRepository } from './supabase/SupabaseProfileRepository';
import { SupabaseBillingRepository } from './supabase/SupabaseBillingRepository';
import { SupabaseCompanyRepository } from './supabase/SupabaseCompanyRepository';
import { SupabaseDevelopmentRepository } from './supabase/SupabaseDevelopmentRepository';
import { SupabaseSimulationRepository } from './supabase/SupabaseSimulationRepository';
import { SupabaseMaterialRepository } from './supabase/SupabaseMaterialRepository';
import { SupabaseLeadRepository } from './supabase/SupabaseLeadRepository';

export interface DataLayer {
  auth: AuthRepository;
  profiles: ProfileRepository;
  billing: BillingRepository;
  companies: CompanyRepository;
  developments: DevelopmentRepository;
  simulations: SimulationRepository;
  material: MaterialRepository;
  leads: LeadRepository;
}

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
        companies: new SupabaseCompanyRepository(),
        developments: new SupabaseDevelopmentRepository(),
        simulations: new SupabaseSimulationRepository(),
        material: new SupabaseMaterialRepository(),
        leads: new SupabaseLeadRepository(),
      };
  }
}

export const db: DataLayer = createDataLayer(ACTIVE_PROVIDER);

export * from './types';
export type {
  AuthRepository,
  BillingRepository,
  CompanyRepository,
  DevelopmentRepository,
  LeadRepository,
  MaterialRepository,
  ProfileRepository,
  SimulationRepository,
} from './repositories';
