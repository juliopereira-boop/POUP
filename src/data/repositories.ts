import type {
  AuthUser,
  Company,
  CompanyInput,
  Correspondent,
  Development,
  DevelopmentInput,
  Lead,
  LeadSource,
  LeadStatus,
  Result,
  Simulation,
  SimulationInput,
  StorageEntry,
  Subscription,
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
  updateStatus(id: string, status: LeadStatus): Promise<Result<void>>;
  remove(id: string): Promise<Result<void>>;
}
