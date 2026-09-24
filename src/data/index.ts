import type {
  AnalyticsRepository,
  AppointmentRepository,
  AuthRepository,
  BillingRepository,
  CatalogRepository,
  CommissionRepository,
  CompanyRepository,
  DevelopmentRepository,
  FeedbackRepository,
  FinancingRepository,
  LeadRepository,
  MaterialRepository,
  ProfileRepository,
  SaleRepository,
  SettingsRepository,
  SimulationRepository,
  UnitRepository,
} from './repositories';
import { SupabaseAuthRepository } from './supabase/SupabaseAuthRepository';
import { SupabaseProfileRepository } from './supabase/SupabaseProfileRepository';
import { SupabaseBillingRepository } from './supabase/SupabaseBillingRepository';
import { SupabaseCompanyRepository } from './supabase/SupabaseCompanyRepository';
import { SupabaseCatalogRepository } from './supabase/SupabaseCatalogRepository';
import { SupabaseDevelopmentRepository } from './supabase/SupabaseDevelopmentRepository';
import { SupabaseFinancingRepository } from './supabase/SupabaseFinancingRepository';
import { SupabaseSimulationRepository } from './supabase/SupabaseSimulationRepository';
import { SupabaseMaterialRepository } from './supabase/SupabaseMaterialRepository';
import { SupabaseLeadRepository } from './supabase/SupabaseLeadRepository';
import { SupabaseAppointmentRepository } from './supabase/SupabaseAppointmentRepository';
import { SupabaseSettingsRepository } from './supabase/SupabaseSettingsRepository';
import { SupabaseSaleRepository } from './supabase/SupabaseSaleRepository';
import { SupabaseCommissionRepository } from './supabase/SupabaseCommissionRepository';
import { SupabaseAnalyticsRepository } from './supabase/SupabaseAnalyticsRepository';
import { SupabaseFeedbackRepository } from './supabase/SupabaseFeedbackRepository';
import { SupabaseUnitRepository } from './supabase/SupabaseUnitRepository';

export interface DataLayer {
  auth: AuthRepository;
  profiles: ProfileRepository;
  billing: BillingRepository;
  companies: CompanyRepository;
  developments: DevelopmentRepository;
  /** Blocos e unidades de cada empreendimento, com o preço por unidade. */
  unidades: UnitRepository;
  /** Catálogo do sistema: as empresas prontas do POUP e as adoções do corretor. */
  catalog: CatalogRepository;
  simulations: SimulationRepository;
  /** Simulador de financiamento habitacional: regras versionadas e simulações. */
  financing: FinancingRepository;
  material: MaterialRepository;
  leads: LeadRepository;
  appointments: AppointmentRepository;
  settings: SettingsRepository;
  sales: SaleRepository;
  commissions: CommissionRepository;
  /** Telemetria do produto. Escrita disparada e esquecida; leitura só do admin. */
  analytics: AnalyticsRepository;
  /** "Reportar problema ou dar sugestão", escrito pelo próprio corretor. */
  feedback: FeedbackRepository;
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
        unidades: new SupabaseUnitRepository(),
        catalog: new SupabaseCatalogRepository(),
        simulations: new SupabaseSimulationRepository(),
        financing: new SupabaseFinancingRepository(),
        material: new SupabaseMaterialRepository(),
        leads: new SupabaseLeadRepository(),
        appointments: new SupabaseAppointmentRepository(),
        settings: new SupabaseSettingsRepository(),
        sales: new SupabaseSaleRepository(),
        commissions: new SupabaseCommissionRepository(),
        analytics: new SupabaseAnalyticsRepository(),
        feedback: new SupabaseFeedbackRepository(),
      };
  }
}

export const db: DataLayer = createDataLayer(ACTIVE_PROVIDER);

export * from './types';
export type {
  AnalyticsRepository,
  AppointmentRepository,
  AuthRepository,
  BillingRepository,
  BlocosResultado,
  CatalogRepository,
  CommissionRepository,
  CompanyRepository,
  DegrauFunil,
  DevelopmentRepository,
  EventoParaGravar,
  FeedbackRepository,
  FinancingRepository,
  LeadRepository,
  LinhaConsumoIA,
  LinhaEvento,
  MaterialRepository,
  ProfileRepository,
  RecadoDoCorretor,
  SaleRepository,
  SettingsRepository,
  SimulationRepository,
  UnitRepository,
} from './repositories';
