import type {
  AppointmentRepository,
  AuthRepository,
  BillingRepository,
  CommissionRepository,
  CompanyRepository,
  DevelopmentRepository,
  LeadRepository,
  MaterialRepository,
  ProfileRepository,
  SaleRepository,
  SettingsRepository,
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
import { SupabaseAppointmentRepository } from './supabase/SupabaseAppointmentRepository';
import { SupabaseSettingsRepository } from './supabase/SupabaseSettingsRepository';
import { SupabaseSaleRepository } from './supabase/SupabaseSaleRepository';
import { SupabaseCommissionRepository } from './supabase/SupabaseCommissionRepository';

export interface DataLayer {
  auth: AuthRepository;
  profiles: ProfileRepository;
  billing: BillingRepository;
  companies: CompanyRepository;
  developments: DevelopmentRepository;
  simulations: SimulationRepository;
  material: MaterialRepository;
  leads: LeadRepository;
  appointments: AppointmentRepository;
  settings: SettingsRepository;
  sales: SaleRepository;
  commissions: CommissionRepository;
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
        appointments: new SupabaseAppointmentRepository(),
        settings: new SupabaseSettingsRepository(),
        sales: new SupabaseSaleRepository(),
        commissions: new SupabaseCommissionRepository(),
      };
  }
}

export const db: DataLayer = createDataLayer(ACTIVE_PROVIDER);

export * from './types';
export type {
  AppointmentRepository,
  AuthRepository,
  BillingRepository,
  CommissionRepository,
  CompanyRepository,
  DevelopmentRepository,
  LeadRepository,
  MaterialRepository,
  ProfileRepository,
  SaleRepository,
  SettingsRepository,
  SimulationRepository,
} from './repositories';
