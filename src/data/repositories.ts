import type {
  Appointment,
  AppointmentInput,
  AppointmentStatusInfo,
  AppointmentType,
  AuthUser,
  Company,
  CompanyInput,
  CompanyMaterial,
  Correspondent,
  Development,
  DevelopmentInput,
  Lead,
  LeadPatch,
  LeadSource,
  LeadStage,
  LeadStageFlag,
  LeadStageInput,
  LeadStatus,
  Result,
  Simulation,
  SimulationInput,
  StorageEntry,
  Subscription,
  TrialCampaign,
  TrialCampaignInput,
  UserProfile,
} from './types';

export interface AuthChangePayload {
  user: AuthUser | null;
}

export interface AuthRepository {
  getCurrentUser(): Promise<AuthUser | null>;

  signInWithPassword(email: string, password: string): Promise<Result<AuthUser>>;

  signUpWithPassword(
    email: string,
    password: string,
    fullName?: string,
  ): Promise<Result<AuthUser | null>>;

  signInWithGoogle(): Promise<Result<void>>;

  sendPasswordReset(email: string): Promise<Result<void>>;

  signOut(): Promise<void>;

  onAuthStateChange(cb: (payload: AuthChangePayload) => void): () => void;
}

export interface ProfileRepository {
  get(userId: string): Promise<UserProfile | null>;
  upsert(
    userId: string,
    patch: Partial<Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<Result<UserProfile>>;
}

export interface BillingRepository {
  getSubscription(userId: string): Promise<Subscription | null>;

  getStorageUsedBytes(userId: string): Promise<number>;

  createCheckoutSession(priceId: string): Promise<Result<{ url: string }>>;

  createBillingPortalSession(): Promise<Result<{ url: string }>>;
}

/**
 * Configurações globais do app, mexidas apenas pelo dono (admin).
 * A autorização de escrita é garantida por RLS no banco, não pela UI.
 */
export interface SettingsRepository {
  /** O usuário logado é admin (está em `public.app_admins`). */
  isAdmin(): Promise<boolean>;

  getTrialCampaign(): Promise<TrialCampaign | null>;

  saveTrialCampaign(input: TrialCampaignInput): Promise<Result<TrialCampaign>>;

  /** Contas em período de teste válido agora. `null` quando não é admin. */
  countActiveTrials(): Promise<number | null>;
}

export interface CompanyRepository {
  list(userId: string): Promise<Company[]>;
  create(userId: string, data: CompanyInput): Promise<Result<Company>>;
  update(id: string, data: CompanyInput): Promise<Result<Company>>;
  remove(id: string): Promise<Result<void>>;

  listCorrespondents(companyId: string): Promise<Correspondent[]>;
  addCorrespondent(userId: string, companyId: string, name: string): Promise<Result<Correspondent>>;
  removeCorrespondent(id: string): Promise<Result<void>>;
}

export interface DevelopmentRepository {
  list(userId: string): Promise<Development[]>;
  create(userId: string, data: DevelopmentInput): Promise<Result<Development>>;
  update(id: string, data: DevelopmentInput): Promise<Result<Development>>;
  remove(id: string): Promise<Result<void>>;
}

export interface SimulationRepository {
  list(userId: string): Promise<Simulation[]>;
  get(id: string): Promise<Simulation | null>;
  create(userId: string, data: SimulationInput): Promise<Result<Simulation>>;
  update(id: string, data: SimulationInput): Promise<Result<Simulation>>;
  remove(id: string): Promise<Result<void>>;
}

export interface MaterialRepository {
  list(userId: string, relPath: string): Promise<StorageEntry[]>;
  createFolder(userId: string, relPath: string, name: string): Promise<Result<void>>;
  upload(
    userId: string,
    relPath: string,
    fileName: string,
    data: Blob,
    contentType: string,
  ): Promise<Result<void>>;
  remove(path: string, isFolder: boolean): Promise<Result<void>>;
  signedUrl(path: string, expiresIn?: number): Promise<string | null>;
  download(path: string): Promise<Blob | null>;
  getCompanyMaterial(userId: string, companyId: string): Promise<CompanyMaterial | null>;
  saveCompanyMaterial(
    userId: string,
    companyId: string,
    driveUrl: string | null,
  ): Promise<Result<CompanyMaterial>>;
}

export interface AppointmentRepository {
  get(id: string): Promise<Appointment | null>;
  listRange(userId: string, startISO: string, endISO: string): Promise<Appointment[]>;
  listByLead(userId: string, leadId: string): Promise<Appointment[]>;
  create(userId: string, data: AppointmentInput): Promise<Result<Appointment>>;
  update(id: string, data: Partial<AppointmentInput>): Promise<Result<Appointment>>;
  setStatus(
    id: string,
    statusId: string,
    extra?: { note?: string | null; reason?: string | null },
  ): Promise<Result<void>>;
  reschedule(id: string, startAt: string, endAt: string | null): Promise<Result<void>>;
  remove(id: string): Promise<Result<void>>;
  listTypes(): Promise<AppointmentType[]>;
  listStatuses(): Promise<AppointmentStatusInfo[]>;
}

export interface LeadRepository {
  list(userId: string): Promise<Lead[]>;
  create(
    userId: string,
    data: {
      name: string;
      phone: string;
      email?: string | null;
      message?: string | null;
      source?: LeadSource;
    },
  ): Promise<Result<Lead>>;
  get(id: string): Promise<Lead | null>;
  updateStatus(id: string, status: LeadStatus): Promise<Result<void>>;
  update(id: string, patch: LeadPatch): Promise<Result<Lead>>;
  remove(id: string): Promise<Result<void>>;

  listStages(userId: string): Promise<LeadStage[]>;
  createStage(userId: string, data: LeadStageInput): Promise<Result<LeadStage>>;
  updateStage(id: string, data: Partial<LeadStageInput>): Promise<Result<LeadStage>>;
  removeStage(id: string): Promise<Result<void>>;
  seedDefaultStages(userId: string): Promise<LeadStage[]>;

  /**
   * Move o lead para a etapa marcada com a flag informada.
   * Retorna a etapa aplicada, ou `null` quando o usuário não tem etapa com essa flag.
   */
  moveToFlaggedStage(
    userId: string,
    leadId: string,
    flag: LeadStageFlag,
  ): Promise<Result<LeadStage | null>>;
}
